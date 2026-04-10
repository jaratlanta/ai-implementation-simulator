/**
 * Image Generator with provider abstraction
 * Supports DALL-E 3, Fal.ai, and Replicate
 */

import type {
  ImageProvider,
  ImageGenerationRequest,
  GeneratedImage,
  ArtStyle,
  ReferenceImage,
  FileReference
} from './types';
import { generateImage as backendGenerateImage } from '../api/ai.js';

/**
 * Custom error for content policy violations
 * Thrown when an image provider rejects a prompt due to safety/content rules
 */
export class ContentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentPolicyError';
  }
}

/**
 * Helper to get actual image dimensions from a data URL
 * Returns a promise with {width, height}
 */
async function getImageDimensions(dataUrl: string): Promise<{ width: number, height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      console.warn('[ImageGenerator] getImageDimensions timed out, using default');
      resolve({ width: 1024, height: 1024 });
    }, 10000);

    img.onload = () => {
      clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timer);
      // Fallback to default if we can't load the image
      resolve({ width: 1024, height: 1024 });
    };
    img.src = dataUrl;
  });
}

/**
 * Abstract base for image generation providers
 */
interface ImageProviderAdapter {
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
}

/**
 * OpenAI Image size options
 */
export type DallESize = '1024x1024' | '1792x1024' | '1024x1792';

/**
 * DALL-E 3 provider adapter (legacy model)
 * Uses dall-e-3 model via POST /v1/images/generations
 */
class DallE3Adapter implements ImageProviderAdapter {
  private size: DallESize = '1792x1024';

  constructor(private apiKey: string) { }

  setSize(size: DallESize): void {
    this.size = size;
  }

  getSize(): DallESize {
    return this.size;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();

    const fullPrompt = this.buildPrompt(request.prompt, request.style);
    // Determine size based on aspect ratio request
    let sizeToUse = this.size;
    if (request.aspectRatio === '1:1') sizeToUse = '1024x1024';
    else if (request.aspectRatio === '16:9') sizeToUse = '1792x1024';
    else if (request.aspectRatio === '9:16') sizeToUse = '1024x1792';

    const [width, height] = sizeToUse.split('x').map(Number);
    console.log(`[DALL-E 3] Generating, size: ${sizeToUse} (from aspect: ${request.aspectRatio || 'default'})`);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: sizeToUse,
        quality: 'standard',
        style: 'vivid',
        response_format: 'b64_json'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error?.message || response.statusText;

      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        error.error?.code === 'content_policy_violation') {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      throw new Error(`DALL-E 3 API error: ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    const base64Data = data.data[0].b64_json;
    const dataUrl = `data:image/png;base64,${base64Data}`;

    console.log(`[DALL-E 3] Generated in ${(generationTime / 1000).toFixed(1)}s`);

    return {
      url: dataUrl,
      width,
      height,
      prompt: fullPrompt,
      revisedPrompt: data.data[0].revised_prompt,
      provider: 'dalle3',
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    // If prompt already contains style keywords, don't wrap it
    if (basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation')) {
      return basePrompt;
    }

    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, no violence, no scary elements, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }
}

/**
 * GPT Image provider adapter (gpt-image-1 model)
 * Uses the modern gpt-image-1 model via POST /v1/images/generations
 * Supports three reference modes:
 * - 'url': Include photo URLs in prompt text (no upload needed)
 * - 'upload': Upload base64 images via edits API
 * - 'none': No photo references
 */
class GPTImageAdapter implements ImageProviderAdapter {
  private size: DallESize = '1792x1024';
  private referenceMode: 'url' | 'upload' | 'none' = 'none';

  constructor(private apiKey: string, referenceMode: 'url' | 'upload' | 'none' = 'none') {
    this.referenceMode = referenceMode;
  }

  setSize(size: DallESize): void {
    this.size = size;
  }

  getSize(): DallESize {
    return this.size;
  }

  getReferenceMode(): 'url' | 'upload' | 'none' {
    return this.referenceMode;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();
    const hasReferenceImages = request.referenceImages && request.referenceImages.length > 0;

    // Upload mode: use the edits API with base64 images
    if (this.referenceMode === 'upload' && hasReferenceImages) {
      return this.generateWithUpload(request, startTime);
    }

    // URL mode or no references: use standard generations API
    // URL references are embedded in the prompt text
    const fullPrompt = this.buildPrompt(request.prompt, request.style, request.referenceImages);

    // Determine size based on aspect ratio request
    let sizeToUse = this.size;
    if (request.aspectRatio === '1:1') sizeToUse = '1024x1024';
    else if (request.aspectRatio === '16:9') sizeToUse = '1792x1024';
    else if (request.aspectRatio === '9:16') sizeToUse = '1024x1792';

    const [width, height] = sizeToUse.split('x').map(Number);
    console.log(`[GPT Image ${this.referenceMode}] Generating with gpt-image-1, size: ${sizeToUse} (from aspect: ${request.aspectRatio || 'default'})`);

    const requestBody: any = {
      model: 'gpt-image-1',
      prompt: fullPrompt,
      n: 1,
      size: sizeToUse
    };

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error?.message || response.statusText;

      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        error.error?.code === 'content_policy_violation') {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      throw new Error(`GPT Image API error: ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    let imageUrl: string;
    const imageData = data.data[0];

    if (imageData.b64_json) {
      imageUrl = `data:image/png;base64,${imageData.b64_json}`;
    } else if (imageData.url) {
      const imgResponse = await fetch(imageData.url);
      const blob = await imgResponse.blob();
      const reader = new FileReader();
      imageUrl = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } else {
      throw new Error('GPT Image API did not return image data');
    }

    console.log(`[GPT Image ${this.referenceMode}] Generated in ${(generationTime / 1000).toFixed(1)}s`);

    return {
      url: imageUrl,
      width,
      height,
      prompt: fullPrompt,
      revisedPrompt: imageData.revised_prompt,
      provider: this.referenceMode === 'url' ? 'gptimage-url' : this.referenceMode === 'upload' ? 'gptimage-upload' : 'gptimage',
      generationTime
    };
  }

  /**
   * Generate image using gpt-image-1 with reference images via the edits API
   * This uses the Images API edit endpoint for character consistency
   */
  private async generateWithUpload(request: ImageGenerationRequest, startTime: number): Promise<GeneratedImage> {
    const fullPrompt = this.buildPromptForUpload(request.prompt, request.style, request.referenceImages!);

    console.log(`[GPT Image upload] Generating with ${request.referenceImages!.length} reference image(s) using gpt-image-1 edits API`);

    // Use FormData for the images/edits endpoint
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', fullPrompt);
    formData.append('n', '1');
    formData.append('size', this.size);

    // Convert base64 reference images to blobs and append
    for (let i = 0; i < request.referenceImages!.length; i++) {
      const ref = request.referenceImages![i];
      // Decode base64 to binary
      const binaryString = atob(ref.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      const blob = new Blob([bytes], { type: ref.mimeType });
      formData.append('image[]', blob, `reference_${i}.png`);
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;

      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        error.error?.code === 'content_policy_violation') {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      throw new Error(`GPT Image upload API error: ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Extract image from the response
    const imageData = data.data?.[0];
    if (!imageData) {
      console.error('[GPT Image upload] Response:', JSON.stringify(data).substring(0, 500));
      throw new Error('GPT Image upload API did not return image data');
    }

    let imageUrl: string;
    if (imageData.b64_json) {
      imageUrl = `data:image/png;base64,${imageData.b64_json}`;
    } else if (imageData.url) {
      // Fetch the URL and convert to data URL
      const imgResponse = await fetch(imageData.url);
      const blob = await imgResponse.blob();
      const reader = new FileReader();
      imageUrl = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } else {
      throw new Error('GPT Image upload API did not return image data');
    }

    const dimensions = await getImageDimensions(imageUrl);

    console.log(`[GPT Image upload] Generated in ${(generationTime / 1000).toFixed(1)}s`);

    return {
      url: imageUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      provider: 'gptimage-upload',
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle, referenceImages?: ReferenceImage[]): string {
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, no violence, no scary elements, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';

    // If prompt is already a complete styled prompt (from LLMPromptGenerator), don't wrap it more than necessary
    const isPreStyled = basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animated');

    // URL mode: Include photo URLs in the prompt for character reference
    if (this.referenceMode === 'url' && referenceImages && referenceImages.length > 0) {
      const urlRefs = referenceImages
        .filter(ref => ref.url || ref.thumbnailUrl)
        .map(ref => {
          const label = ref.label || 'PERSON';
          const url = ref.thumbnailUrl || ref.url;
          return `${label}: ${url}`;
        })
        .join('\n');

      if (urlRefs) {
        if (isPreStyled) {
          return `Use these photo references to create the characters:
${urlRefs}

${basePrompt}`;
        }
        return `Use these photo references to create the characters in a cinematic quality 3D animated illustration:

${urlRefs}

${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
      }
    }

    if (isPreStyled) return basePrompt;

    // No reference mode: prepend "Create a"
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }

  private buildPromptForUpload(basePrompt: string, style: ArtStyle, referenceImages: ReferenceImage[]): string {
    if (referenceImages.length === 0) {
      if (basePrompt.toLowerCase().includes('3d animated')) return basePrompt;
      return `Create a ${basePrompt}. Style: ${style.promptModifiers.join(', ')}. cute and adorable, 3D animated style`;
    }

    const referenceInstructions = `Use the provided reference images to create the characters in a cinematic quality 3D animated illustration.`;

    // If prompt already has style info, don't duplicate SCENE/Style
    if (basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation')) {
      return `${referenceInstructions} ${basePrompt}`;
    }

    return `${referenceInstructions} SCENE: ${basePrompt}. Style: ${style.promptModifiers.join(', ')}. cute and adorable, 3D animated style`;
  }
}

/**
 * GPT-4o Image Generation provider adapter
 * Uses OpenAI's gpt-image-1 model which supports reference images
 */
class GPT4oImageAdapter implements ImageProviderAdapter {
  constructor(private apiKey: string) { }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();
    const fullPrompt = this.buildPrompt(request.prompt, request.style, request.referenceImages);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[GPT-4o] Retry attempt ${attempt + 1}/3 after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const result = await this.makeRequest(fullPrompt, startTime, request.referenceImages);
        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry content policy errors
        if (error instanceof ContentPolicyError) {
          throw error;
        }

        // Check if it's a rate limit or server error (worth retrying)
        const isRetryable = error.message?.includes('rate') ||
          error.message?.includes('429') ||
          error.message?.includes('500') ||
          error.message?.includes('502') ||
          error.message?.includes('503') ||
          error.message?.includes('timeout') ||
          error.message?.includes('network');

        if (!isRetryable && attempt === 0) {
          console.warn(`[GPT-4o] Request failed: ${error.message}. Will retry once.`);
          continue;
        }

        if (attempt === 2) {
          console.error(`[GPT-4o] All 3 attempts failed. Last error: ${error.message}`);
          throw lastError;
        }

        console.warn(`[GPT-4o] Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }

    throw lastError || new Error('GPT-4o API failed after all retries');
  }

  private async makeRequest(fullPrompt: string, startTime: number, referenceImages?: ReferenceImage[]): Promise<GeneratedImage> {
    // Use OpenAI's Responses API with image_generation tool
    // Input should be a 'message' type with content array

    // Build the content array for the message
    const content: any[] = [];

    // Add reference images first if provided
    if (referenceImages && referenceImages.length > 0) {
      console.log(`[GPT-4o] Including ${referenceImages.length} reference image(s)`);
      for (const ref of referenceImages) {
        content.push({
          type: 'input_image',
          image_url: `data:${ref.mimeType};base64,${ref.base64}`
        });
      }
    }

    // Add the text prompt
    content.push({
      type: 'input_text',
      text: fullPrompt
    });

    const requestBody = {
      model: 'gpt-4o',
      input: [
        {
          type: 'message',
          role: 'user',
          content: content
        }
      ],
      tools: [{ type: 'image_generation', quality: 'high' }],
      tool_choice: { type: 'image_generation' }  // Force image generation tool use
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;
      const statusCode = response.status;

      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        error.error?.code === 'content_policy_violation') {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      throw new Error(`GPT-4o API error (${statusCode}): ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Extract image from the response output array
    // Look for image_generation_call type outputs
    const imageOutput = data.output?.find((out: any) => out.type === 'image_generation_call');

    if (!imageOutput?.result) {
      console.error('[GPT-4o] Response:', JSON.stringify(data).substring(0, 500));
      throw new Error('GPT-4o API did not return image data');
    }

    const base64Data = imageOutput.result;
    const dataUrl = `data:image/png;base64,${base64Data}`;
    const dimensions = await getImageDimensions(dataUrl);

    return {
      url: dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      provider: 'gpt4o',
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle, referenceImages?: ReferenceImage[]): string {
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, no violence, no scary elements, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';

    const isPreStyled = basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation');

    // If we have reference images, add explicit generation instructions
    if (referenceImages && referenceImages.length > 0) {
      const referenceInstructions = `Use the provided reference images to create the characters in a cinematic quality 3D animated illustration.`;

      if (isPreStyled) {
        return `${referenceInstructions} ${basePrompt}`;
      }
      return `${referenceInstructions} SCENE: ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
    }

    if (isPreStyled) return basePrompt;

    // Non-reference prompt: prepend "Create a"
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }
}

/**
 * Fal.ai FLUX provider adapter (placeholder for future implementation)
 */
class FalAdapter implements ImageProviderAdapter {
  constructor(private apiKey: string) { }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();

    // Build prompt
    const fullPrompt = this.buildPrompt(request.prompt, request.style);

    const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${this.apiKey}`
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        image_size: 'landscape_16_9',
        num_images: 1,
        enable_safety_checker: true
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Fal.ai error: ${error.detail || response.statusText}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    return {
      url: data.images[0].url,
      width: data.images[0].width,
      height: data.images[0].height,
      prompt: fullPrompt,
      provider: 'fal',
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    if (basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation')) {
      return basePrompt;
    }
    const styleModifiers = style.promptModifiers.join(', ');
    return `Create a ${basePrompt}, ${styleModifiers}, safe for children, gentle and friendly`;
  }
}

/**
 * Replicate SDXL provider adapter (placeholder for future implementation)
 */
class ReplicateAdapter implements ImageProviderAdapter {
  constructor(private apiKey: string) { }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();

    const fullPrompt = this.buildPrompt(request.prompt, request.style);
    const negativePrompt = request.style.negativePrompts.join(', ');

    // Determine dimensions based on aspect ratio
    let width = 1216;
    let height = 688;
    if (request.aspectRatio === '1:1') {
      width = 1024;
      height = 1024;
    } else if (request.aspectRatio === '9:16') {
      width = 688;
      height = 1216;
    }

    console.log(`[Replicate] Generating, dimensions: ${width}x${height} (from aspect: ${request.aspectRatio || 'default'})`);

    // Start prediction
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.apiKey}`
      },
      body: JSON.stringify({
        version: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
        input: {
          prompt: fullPrompt,
          negative_prompt: negativePrompt,
          width,
          height,
          num_outputs: 1
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate error: ${error.detail || response.statusText}`);
    }

    const prediction = await response.json();

    // Poll for completion
    const result = await this.pollForResult(prediction.urls.get);
    const generationTime = Date.now() - startTime;

    return {
      url: result.output[0],
      width,
      height,
      prompt: fullPrompt,
      provider: 'replicate',
      generationTime
    };
  }

  private async pollForResult(url: string, maxAttempts = 60): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(url, {
        headers: { 'Authorization': `Token ${this.apiKey}` }
      });
      const result = await response.json();

      if (result.status === 'succeeded') {
        return result;
      } else if (result.status === 'failed') {
        throw new Error(`Replicate generation failed: ${result.error}`);
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Replicate generation timed out');
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    if (basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation')) {
      return basePrompt;
    }
    const styleModifiers = style.promptModifiers.join(', ');
    return `Create a ${basePrompt}, ${styleModifiers}, safe for children`;
  }
}

/**
 * Grok (xAI Aurora) image generation provider adapter
 * Uses the xAI API for image generation
 */
class GrokAdapter implements ImageProviderAdapter {
  constructor(private apiKey: string) { }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();
    const fullPrompt = this.buildPrompt(request.prompt, request.style);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[Grok] Retry attempt ${attempt + 1}/3 after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const result = await this.makeRequest(fullPrompt, startTime, request.aspectRatio);
        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry content policy errors
        if (error instanceof ContentPolicyError) {
          throw error;
        }

        // Check if it's a rate limit or server error (worth retrying)
        const isRetryable = error.message?.includes('rate') ||
          error.message?.includes('429') ||
          error.message?.includes('500') ||
          error.message?.includes('502') ||
          error.message?.includes('503') ||
          error.message?.includes('timeout') ||
          error.message?.includes('network');

        if (!isRetryable && attempt === 0) {
          // First attempt failed with non-retryable error, still try once more
          console.warn(`[Grok] Request failed: ${error.message}. Will retry once.`);
          continue;
        }

        if (attempt === 2) {
          // Last attempt failed
          console.error(`[Grok] All 3 attempts failed. Last error: ${error.message}`);
          throw lastError;
        }

        console.warn(`[Grok] Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }

    throw lastError || new Error('Grok API failed after all retries');
  }

  private async makeRequest(fullPrompt: string, startTime: number, aspectRatio?: string): Promise<GeneratedImage> {
    // xAI uses a similar API structure to OpenAI
    // Request base64 to avoid CORS issues when generating PDFs
    // Determine dimensions based on aspect ratio
    let width = 1280;
    let height = 720;
    if (aspectRatio === '1:1') {
      width = 1024;
      height = 1024;
    } else if (aspectRatio === '9:16') {
      width = 720;
      height = 1280;
    }

    console.log(`[Grok] Generating, dimensions: ${width}x${height} (from aspect: ${aspectRatio || 'default'})`);

    const response = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'grok-2-image',
        prompt: fullPrompt,
        n: 1,
        width,
        height,
        response_format: 'b64_json'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;
      const statusCode = response.status;

      // Check for content policy violations
      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        errorMessage.toLowerCase().includes('inappropriate') ||
        errorMessage.toLowerCase().includes('violated')) {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      // Include status code in error for retry logic
      throw new Error(`Grok API error (${statusCode}): ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Extract base64 data from response and convert to data URL
    const base64Data = data.data?.[0]?.b64_json;
    if (!base64Data) {
      throw new Error('Grok API did not return image data');
    }

    const dataUrl = `data:image/png;base64,${base64Data}`;

    // Get actual image dimensions (Grok may return different sizes)
    const dimensions = await getImageDimensions(dataUrl);

    return {
      url: dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      revisedPrompt: data.data?.[0]?.revised_prompt,
      provider: 'grok',
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    if (basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation')) {
      return basePrompt;
    }
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, no violence, no scary elements, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }
}

/**
 * Gemini 2.5 Flash Files API Upload-Once adapter
 * Specialized for story generation where reference photos are uploaded once
 * and reused for multiple image generations throughout the story.
 * 
 * Key features:
 * - Upload reference images once to Files API at story start
 * - Store persistent file URIs for the story session
 * - Generate multiple images using the same file URIs (no re-upload)
 * - Optimized for hundreds of generations per day
 */
class Gemini25FlashFilesUploadAdapter implements ImageProviderAdapter {
  private model: string = 'gemini-2.5-flash-image';
  private uploadedFileRefs: Map<string, any> = new Map(); // Cache uploaded file references

  constructor(private apiKey: string) { }

  /**
   * Upload reference images to Files API once and cache the URIs
   * This should be called at the beginning of a story session
   */
  async uploadReferenceImages(referenceImages: ReferenceImage[]): Promise<FileReference[]> {
    const fileReferences: FileReference[] = [];

    console.log(`[Gemini Files Upload] Uploading ${referenceImages.length} reference images once...`);

    for (let i = 0; i < referenceImages.length; i++) {
      const ref = referenceImages[i];
      const cacheKey = `${ref.description}_${ref.base64.substring(0, 20)}`;

      // Check if already uploaded
      if (this.uploadedFileRefs.has(cacheKey)) {
        console.log(`[Gemini Files Upload] Using cached reference: ${ref.description}`);
        fileReferences.push(this.uploadedFileRefs.get(cacheKey));
        continue;
      }

      try {
        // Optimize image size before upload if it's too large
        const optimizedRef = await this.optimizeReferenceImage(ref);

        const fileRef = await this.uploadToFilesAPI(optimizedRef, i);
        this.uploadedFileRefs.set(cacheKey, fileRef);
        fileReferences.push(fileRef);
        console.log(`[Gemini Files Upload] ✅ Uploaded ${ref.description}: ${fileRef.fileUri}`);
      } catch (error) {
        console.error(`[Gemini Files Upload] ❌ Failed to upload ${ref.description}:`, error);
        throw error;
      }
    }

    console.log(`[Gemini Files Upload] All ${fileReferences.length} references uploaded and cached!`);
    return fileReferences;
  }

  /**
   * Optimize reference image size for faster upload
   * Compresses images that are larger than 200KB
   */
  private async optimizeReferenceImage(ref: ReferenceImage): Promise<ReferenceImage> {
    const originalSize = Math.round(ref.base64.length * 0.75); // Approximate binary size

    // If image is already small enough, return as-is
    if (originalSize < 200 * 1024) { // 200KB threshold
      console.log(`[Gemini Files Upload] Image already optimized: ${Math.round(originalSize / 1024)}KB`);
      return ref;
    }

    console.log(`[Gemini Files Upload] Compressing large image: ${Math.round(originalSize / 1024)}KB`);

    try {
      // Create canvas to compress the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      return new Promise((resolve) => {
        img.onload = () => {
          // Calculate new dimensions (max 512x512 for reference images)
          const maxSize = 512;
          let { width, height } = img;

          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height * maxSize) / width;
              width = maxSize;
            } else {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Draw and compress
          ctx!.drawImage(img, 0, 0, width, height);

          // Convert to JPEG with compression
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const compressedBase64 = compressedDataUrl.split(',')[1];

          const newSize = Math.round(compressedBase64.length * 0.75);
          console.log(`[Gemini Files Upload] Compressed: ${Math.round(originalSize / 1024)}KB → ${Math.round(newSize / 1024)}KB`);

          resolve({
            ...ref,
            base64: compressedBase64,
            mimeType: 'image/jpeg'
          });
        };

        img.src = `data:${ref.mimeType};base64,${ref.base64}`;
      });
    } catch (error) {
      console.warn('[Gemini Files Upload] Compression failed, using original:', error);
      return ref;
    }
  }

  /**
   * Generate image using cached file URIs (no re-upload)
   */
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();

    // Use file references if available, otherwise fall back to upload
    let fileReferences: FileReference[] = [];

    if (request.fileReferences && request.fileReferences.length > 0) {
      // Use provided file references (already uploaded)
      fileReferences = request.fileReferences;
      console.log(`[Gemini Files Upload] Using ${fileReferences.length} cached file references`);
    } else if (request.referenceImages && request.referenceImages.length > 0) {
      // Upload reference images if not already uploaded
      fileReferences = await this.uploadReferenceImages(request.referenceImages);
    }

    const fullPrompt = this.buildPrompt(request.prompt, request.style, fileReferences);

    // Build request parts - prompt first, then file references
    const requestParts: any[] = [{ text: fullPrompt }];

    // Add file references using the correct format
    for (const ref of fileReferences) {
      requestParts.push({
        fileData: {
          mimeType: 'image/jpeg', // Files API handles the actual mime type
          fileUri: ref.fileUri
        }
      });
    }

    console.log(`[Gemini Files Upload] Generating image using ${fileReferences.length} file references (no re-upload)`);

    // Build generation config with aspect ratio support
    const generationConfig: any = {
      responseModalities: ['TEXT', 'IMAGE']
    };

    // Add aspect ratio (default to 16:9)
    const finalAspectRatio = request.aspectRatio || '16:9';
    generationConfig.imageConfig = {
      aspectRatio: finalAspectRatio
    };
    console.log(`[Gemini Files Upload] Using aspect ratio: ${finalAspectRatio}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: requestParts }],
          generationConfig
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;
      const statusCode = response.status;

      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        errorMessage.toLowerCase().includes('inappropriate') ||
        errorMessage.toLowerCase().includes('blocked')) {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      throw new Error(`Gemini API error (${statusCode}): ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Extract image from response
    const parts = data.candidates?.[0]?.content?.parts || [];
    let base64Data: string | null = null;
    let mimeType = 'image/png';

    for (const part of parts) {
      if (part.inlineData) {
        base64Data = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!base64Data) {
      const blockReason = data.candidates?.[0]?.finishReason;
      if (blockReason === 'SAFETY') {
        throw new ContentPolicyError('Image generation blocked due to safety filters');
      }
      throw new Error('Gemini API did not return image data');
    }

    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    const dimensions = await getImageDimensions(dataUrl);

    console.log(`[Gemini Files Upload] ✅ Generated image in ${(generationTime / 1000).toFixed(1)}s using cached references`);

    return {
      url: dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      provider: 'gemini-2.5-flash-files-upload',
      generationTime
    };
  }

  /**
   * Upload a single reference image to Files API with compression optimization
   */
  private async uploadToFilesAPI(referenceImage: ReferenceImage, index: number): Promise<FileReference> {
    console.log(`[Gemini Files Upload] Uploading reference ${index + 1}...`);

    // Convert base64 to binary for upload
    const binaryString = atob(referenceImage.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const numBytes = bytes.length;
    const mimeType = referenceImage.mimeType;
    const displayName = `reference_${index}_${Date.now()}.jpg`;

    console.log(`[Gemini Files Upload] Uploading ${displayName} (${Math.round(numBytes / 1024)}KB)`);

    // Step 1: Initial resumable request
    const initialResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': numBytes.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: { display_name: displayName }
        })
      }
    );

    if (!initialResponse.ok) {
      const error = await initialResponse.json().catch(() => ({ error: { message: initialResponse.statusText } }));
      throw new Error(`Files API initial request failed: ${error.error?.message || initialResponse.statusText}`);
    }

    const uploadUrl = initialResponse.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) {
      throw new Error('No upload URL returned from Files API');
    }

    console.log(`[Gemini Files Upload] Uploading ${Math.round(numBytes / 1024)}KB to Files API...`);

    // Step 2: Upload the actual bytes
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': numBytes.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: bytes
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({ error: { message: uploadResponse.statusText } }));
      throw new Error(`Files API upload failed: ${error.error?.message || uploadResponse.statusText}`);
    }

    const data = await uploadResponse.json();

    if (!data.file?.uri) {
      throw new Error('Files API did not return a file URI');
    }

    // Step 3: Wait for file to be processed
    const fileName = data.file.name;

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${this.apiKey}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();

        if (statusData.file?.state === 'ACTIVE') {
          break;
        } else if (statusData.file?.state === 'FAILED') {
          throw new Error(`File processing failed: ${statusData.file?.error?.message || 'Unknown error'}`);
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      fileUri: data.file.uri,
      description: referenceImage.description,
      label: referenceImage.label
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle, fileReferences?: FileReference[]): string {
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, no violence, no scary elements, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';

    const isPreStyled = basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation');

    if (fileReferences && fileReferences.length > 0) {
      const referenceInstructions = `Use the provided reference images to create the characters in a cinematic quality 3D animated illustration.`;
      if (isPreStyled) return `${referenceInstructions} ${basePrompt}`;
      return `${referenceInstructions} SCENE: ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
    }

    if (isPreStyled) return basePrompt;
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }

  /**
   * Clear cached file references (call when story session ends)
   */
  clearCache(): void {
    this.uploadedFileRefs.clear();
    console.log('[Gemini Files Upload] Cleared file reference cache');
  }

  /**
   * Get cached file references count
   */
  getCachedReferencesCount(): number {
    return this.uploadedFileRefs.size;
  }
}

/**
 * Google Gemini image generation provider adapter
 * Uses the Gemini 2.5 Flash image generation model
 * Supports three reference modes:
 * - 'url': Include photo URLs in prompt text (fastest, recommended)
 * - 'upload': Upload base64 images inline (legacy)
 * - 'none': No photo references
 */
class GeminiImageAdapter implements ImageProviderAdapter {
  private model: string = 'gemini-2.5-flash-image'; // Default model - will be upgraded
  private referenceMode: 'url' | 'upload' | 'none' = 'none';
  private providerName: ImageProvider = 'gemini'; // Track the provider name for return value

  constructor(private apiKey: string, referenceMode: 'url' | 'upload' | 'none' = 'none', model?: string, providerName?: ImageProvider) {
    this.referenceMode = referenceMode;
    if (model) {
      this.model = model;
    }
    if (providerName) {
      this.providerName = providerName;
    } else {
      // Default provider name based on reference mode
      this.providerName = referenceMode === 'url' ? 'gemini-url' : referenceMode === 'upload' ? 'gemini-upload' : 'gemini';
    }
  }

  /**
   * Set the Gemini model to use
   * Options: 'gemini-2.5-flash-image' (current default)
   *          'gemini-2.5-flash-preview-05-20' (newer, recommended)
   */
  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  getReferenceMode(): 'url' | 'upload' | 'none' {
    return this.referenceMode;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();
    const fullPrompt = this.buildPrompt(request.prompt, request.style, request.referenceImages);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[Gemini ${this.referenceMode}] Retry attempt ${attempt + 1}/3 after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const result = await this.makeRequest(fullPrompt, startTime, request.referenceImages, request.fileReferences, request.aspectRatio);
        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry content policy errors
        if (error instanceof ContentPolicyError) {
          throw error;
        }

        // Check if it's a rate limit or server error (worth retrying)
        const isRetryable = error.message?.includes('rate') ||
          error.message?.includes('429') ||
          error.message?.includes('500') ||
          error.message?.includes('502') ||
          error.message?.includes('503') ||
          error.message?.includes('timeout') ||
          error.message?.includes('network');

        if (!isRetryable && attempt === 0) {
          console.warn(`[Gemini ${this.referenceMode}] Request failed: ${error.message}. Will retry once.`);
          continue;
        }

        if (attempt === 2) {
          console.error(`[Gemini ${this.referenceMode}] All 3 attempts failed. Last error: ${error.message}`);
          throw lastError;
        }

        console.warn(`[Gemini ${this.referenceMode}] Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }

    throw lastError || new Error('Gemini API failed after all retries');
  }

  private async makeRequest(fullPrompt: string, startTime: number, referenceImages?: ReferenceImage[], fileReferences?: FileReference[], aspectRatio?: string): Promise<GeneratedImage> {
    // Build the request parts array - text prompt first
    const requestParts: any[] = [{ text: fullPrompt }];

    // Add file references first (more efficient than inline images)
    if (fileReferences && fileReferences.length > 0) {
      console.log(`[Gemini ${this.referenceMode}] Using ${fileReferences.length} file reference(s) from Files API`);

      for (const fileRef of fileReferences) {
        requestParts.push({
          fileData: {
            mimeType: 'image/jpeg', // Files API handles the actual mime type
            fileUri: fileRef.fileUri
          }
        });
      }
    }
    // Only add inline base64 images for 'upload' mode when no file references
    // 'url' mode has URLs in the prompt text
    // 'none' mode has no references
    else if (this.referenceMode === 'upload' && referenceImages && referenceImages.length > 0) {
      const maxImages = 3; // Gemini limit
      const imagesToUse = referenceImages.slice(0, maxImages);

      if (referenceImages.length > maxImages) {
        console.warn(`[Gemini upload] Only using first ${maxImages} reference images (${referenceImages.length} provided)`);
      }

      console.log(`[Gemini upload] Using ${imagesToUse.length} inline reference image(s)`);

      for (const refImage of imagesToUse) {
        requestParts.push({
          inlineData: {
            mimeType: refImage.mimeType,
            data: refImage.base64
          }
        });
      }
    } else if (this.referenceMode === 'url') {
      console.log(`[Gemini url] Using URL-based references in prompt`);
    }

    // Build generation config with aspect ratio support
    const generationConfig: any = {
      responseModalities: ['TEXT', 'IMAGE']
    };

    // Add aspect ratio (default to 16:9)
    const finalAspectRatio = aspectRatio || '16:9';
    generationConfig.imageConfig = {
      aspectRatio: finalAspectRatio
    };
    console.log(`[Gemini ${this.referenceMode}] Using aspect ratio: ${finalAspectRatio}`);

    // Use the configured model
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: requestParts
          }],
          generationConfig
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;
      const statusCode = response.status;

      // Check for content policy violations
      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety') ||
        errorMessage.toLowerCase().includes('inappropriate') ||
        errorMessage.toLowerCase().includes('blocked')) {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      throw new Error(`Gemini API error (${statusCode}): ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Extract image from response - Gemini returns parts array with text and/or image
    const parts = data.candidates?.[0]?.content?.parts || [];
    let base64Data: string | null = null;
    let mimeType = 'image/png';

    for (const part of parts) {
      if (part.inlineData) {
        base64Data = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!base64Data) {
      // Check if there's a safety block
      const blockReason = data.candidates?.[0]?.finishReason;
      if (blockReason === 'SAFETY') {
        throw new ContentPolicyError('Image generation blocked due to safety filters');
      }
      throw new Error('Gemini API did not return image data');
    }

    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    // Get actual image dimensions (Gemini may return different sizes)
    const dimensions = await getImageDimensions(dataUrl);

    return {
      url: dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      provider: this.providerName,
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle, referenceImages?: ReferenceImage[], fileReferences?: FileReference[]): string {
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, no violence, no scary elements, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';

    const isPreStyled = basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation');
    const hasReferences = (fileReferences && fileReferences.length > 0) || (this.referenceMode === 'url' && referenceImages && referenceImages.length > 0);

    const referenceInstructions = hasReferences ? `Use the provided reference images to create the characters in a cinematic quality 3D animated illustration.` : '';

    if (isPreStyled) {
      if (hasReferences) {
        // If it's URL mode, we should still handle the URL mapping if that's where they are
        if (this.referenceMode === 'url' && referenceImages && referenceImages.length > 0) {
          const urlRefs = referenceImages
            .filter(ref => ref.url || ref.thumbnailUrl)
            .map(ref => {
              const label = ref.label || 'PERSON';
              const url = ref.thumbnailUrl || ref.url;
              return `${label}: ${url}`;
            })
            .join('\n');
          return `${referenceInstructions}\n\n${urlRefs}\n\n${basePrompt}`;
        }
        return `${referenceInstructions} ${basePrompt}`;
      }
      return basePrompt;
    }

    // Standard wrapping for non-pre-styled prompts
    if (fileReferences && fileReferences.length > 0) {
      return `${referenceInstructions} SCENE: ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
    }

    if (this.referenceMode === 'url' && referenceImages && referenceImages.length > 0) {
      const urlRefs = referenceImages
        .filter(ref => ref.url || ref.thumbnailUrl)
        .map(ref => {
          const label = ref.label || 'PERSON';
          const url = ref.thumbnailUrl || ref.url;
          return `${label}: ${url}`;
        })
        .join('\n');
      return `${referenceInstructions}\n\n${urlRefs}\n\nSCENE: ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
    }

    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }
}

/**
 * Google Imagen 3.0 provider adapter (via Google AI Studio)
 * Uses the dedicated Imagen 3.0 model which provides much higher quality than Gemini-based hallucination
 */
class Imagen3Adapter implements ImageProviderAdapter {
  private model: string = 'imagen-4.0-generate-001';

  constructor(private apiKey: string, model?: string) {
    if (model) {
      this.model = model;
    }
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();
    const fullPrompt = this.buildPrompt(request.prompt, request.style);

    console.log(`[Imagen 4.0] Generating with ${this.model}, aspectRatio: ${request.aspectRatio || '16:9'}`);

    const negativePrompt = request.style?.negativePrompts ? request.style.negativePrompts.join(', ') : 'scary, dark, violent, horror, photorealistic, realistic skin texture, sharp pores';

    const promptWithNegatives = `${fullPrompt}. Avoid: ${negativePrompt}`;

    // Log the full prompt for debugging
    console.log(`[Imagen 4.0] Sending prompt: "${promptWithNegatives}"`);

    // Google AI Studio (generativelanguage) endpoint for Imagen 3/4
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predict?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: promptWithNegatives
              // NOTE: 'image' parameter is currently not supported for imagen-3.0/4.0 
              // via the generativelanguage predict endpoint. 
              // We rely on the vision-refined text description for likeness.
            }
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: request.aspectRatio || '16:9',
            safetySetting: 'BLOCK_LOW_AND_ABOVE',
            personGeneration: 'ALLOW_ADULT'
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;

      if (errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('safety')) {
        throw new ContentPolicyError(`Imagen 3 Content policy violation: ${errorMessage}`);
      }

      throw new Error(`Imagen 3 API error: ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Extract image from response - Imagen returns predictions array
    const prediction = data.predictions?.[0];
    if (!prediction || !prediction.bytesBase64Encoded) {
      throw new Error('Imagen 3 API did not return image data');
    }

    const dataUrl = `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;

    // Get actual image dimensions
    const dimensions = await getImageDimensions(dataUrl);

    console.log(`[Imagen 4.0] ✅ Generated image in ${(generationTime / 1000).toFixed(1)}s`);

    return {
      url: dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      provider: 'imagen-4.0' as any,
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';

    const isPreStyled = basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation');

    if (isPreStyled) return basePrompt;
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }
}

/**
 * Google Vertex AI Imagen 3.0 provider adapter
 * Uses the Vertex AI endpoint for Imagen 3.0
 */
class VertexImagenAdapter implements ImageProviderAdapter {
  private model: string = 'imagen-3.0-generate-001';
  private location: string = 'us-central1';
  private projectId: string = '';

  constructor(private accessToken: string, projectId: string, location?: string, model?: string) {
    this.projectId = projectId;
    if (location) this.location = location;
    if (model) this.model = model;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();
    const fullPrompt = this.buildPrompt(request.prompt, request.style);

    if (!this.projectId) {
      throw new Error('Vertex AI Project ID is required for VertexImagenAdapter');
    }

    console.log(`[Vertex Imagen] Generating in ${this.projectId}/${this.location} with ${this.model}`);

    const response = await fetch(
      `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:predict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: fullPrompt
            }
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: request.aspectRatio || '16:9',
            safetySetting: 'BLOCK_LOW_AND_ABOVE',
            personGeneration: 'ALLOW_ADULT'
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || error.message || response.statusText;
      throw new Error(`Vertex Imagen API error: ${errorMessage}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    const prediction = data.predictions?.[0];
    if (!prediction || !prediction.bytesBase64Encoded) {
      throw new Error('Vertex Imagen API did not return image data');
    }

    const dataUrl = `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;
    const dimensions = await getImageDimensions(dataUrl);

    console.log(`[Vertex Imagen] ✅ Generated image in ${(generationTime / 1000).toFixed(1)}s`);

    return {
      url: dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      prompt: fullPrompt,
      provider: 'vertex-imagen' as any,
      generationTime
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    const styleModifiers = style.promptModifiers.join(', ');
    const safetyTerms = 'cute and adorable, safe for children, gentle and friendly, high-budget 3D animated movie style, subsurface scattering, octane render, volumetric lighting';

    const isPreStyled = basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation');

    if (isPreStyled) return basePrompt;
    return `Create a ${basePrompt}. Style: ${styleModifiers}. ${safetyTerms}`;
  }
}

/**
 * Quality presets for ComfyUI image generation
 * All use SDXL Base with euler sampler and normal scheduler (original working settings)
 */
export type QualityTier = 'XS' | 'S' | 'M' | 'M+' | 'L' | 'L+' | 'XL';

export interface QualityPreset {
  tier: QualityTier;
  name: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  // SDXL requires minimum 768px on shortest side for good quality
  // All presets now use SDXL-compatible resolutions
  'XS': {
    tier: 'XS',
    name: 'Fast Preview',
    width: 1024,
    height: 576,
    steps: 8,  // Very fast, lower quality
    cfg: 7
  },
  'S': {
    tier: 'S',
    name: 'Quick',
    width: 1024,
    height: 576,
    steps: 12,
    cfg: 7
  },
  'M': {
    tier: 'M',
    name: 'Balanced',
    width: 1024,
    height: 576,
    steps: 15,
    cfg: 7
  },
  'M+': {
    tier: 'M+',
    name: 'Good',
    width: 1024,
    height: 576,
    steps: 20,
    cfg: 7
  },
  'L': {
    tier: 'L',
    name: 'High Quality',
    width: 1280,
    height: 720,
    steps: 20,
    cfg: 7
  },
  'L+': {
    tier: 'L+',
    name: 'Very High',
    width: 1280,
    height: 720,
    steps: 25,
    cfg: 7
  },
  'XL': {
    tier: 'XL',
    name: 'Maximum',
    width: 1536,
    height: 864,
    steps: 30,
    cfg: 7
  }
};

/**
 * ComfyUI local Stable Diffusion provider adapter
 * Connects to a locally running ComfyUI server
 * Uses SDXL Base with euler sampler and normal scheduler (proven settings)
 */
class ComfyUIAdapter implements ImageProviderAdapter {
  private serverUrl: string;
  private qualityTier: QualityTier = 'L'; // Default to Large

  constructor(serverUrl: string = 'http://127.0.0.1:8188') {
    this.serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  setQualityTier(tier: QualityTier): void {
    this.qualityTier = tier;
  }

  getQualityTier(): QualityTier {
    return this.qualityTier;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Interrupt/cancel the current generation
   */
  async interrupt(): Promise<void> {
    try {
      await fetch(`${this.serverUrl}/interrupt`, {
        method: 'POST'
      });
      console.log('[ComfyUI] Interrupted current generation');
    } catch (e) {
      console.error('[ComfyUI] Failed to interrupt:', e);
    }
  }

  /**
   * Clear the queue of pending generations
   */
  async clearQueue(): Promise<void> {
    try {
      await fetch(`${this.serverUrl}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true })
      });
      console.log('[ComfyUI] Cleared queue');
    } catch (e) {
      console.error('[ComfyUI] Failed to clear queue:', e);
    }
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const startTime = Date.now();

    const fullPrompt = this.buildPrompt(request.prompt, request.style);
    const negativePrompt = request.style.negativePrompts.join(', ') + ', nsfw, violence, scary, horror, blood';

    // Build the ComfyUI workflow with quality preset
    const preset = QUALITY_PRESETS[this.qualityTier];
    const workflow = this.buildWorkflow(fullPrompt, negativePrompt, preset);

    // Queue the prompt
    const queueResponse = await fetch(`${this.serverUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: crypto.randomUUID()
      })
    });

    if (!queueResponse.ok) {
      const error = await queueResponse.text();
      throw new Error(`ComfyUI queue error: ${error}`);
    }

    const responseData = await queueResponse.json();

    const promptId = responseData.prompt_id;
    if (!promptId) {
      throw new Error(`ComfyUI did not return a prompt_id: ${JSON.stringify(responseData)}`);
    }

    console.log(`[ComfyUI] ⏳ Queued with ID: ${promptId}`);

    // Poll for completion
    const imageUrl = await this.pollForResult(promptId);
    const generationTime = Date.now() - startTime;

    console.log(`[ComfyUI] ✅ Complete! Generated in ${(generationTime / 1000).toFixed(1)}s`);
    console.log(`[ComfyUI] 📁 ${imageUrl.split('filename=')[1]?.split('&')[0] || 'image'}`);

    return {
      url: imageUrl,
      width: preset.width,
      height: preset.height,
      prompt: fullPrompt,
      provider: 'comfyui',
      generationTime,
      steps: preset.steps
    };
  }

  /**
   * Upscale an existing image using ComfyUI's built-in upscaler
   * Uses lanczos interpolation for clean upscaling (fast, no model needed)
   */
  async upscale(imageUrl: string, targetWidth: number, targetHeight: number, originalPrompt: string): Promise<GeneratedImage> {
    const startTime = Date.now();

    console.log(`[ComfyUI] ═══════════════════════════════════════`);
    console.log(`[ComfyUI] ⬆️ Upscaling Image`);
    console.log(`[ComfyUI] ───────────────────────────────────────`);
    console.log(`[ComfyUI] Target:  ${targetWidth}×${targetHeight}`);
    console.log(`[ComfyUI] Method:  lanczos`);
    console.log(`[ComfyUI] ═══════════════════════════════════════`);

    // First, we need to upload/load the image to ComfyUI
    // Extract filename from the ComfyUI URL
    const urlParams = new URL(imageUrl).searchParams;
    const filename = urlParams.get('filename') || '';
    const subfolder = urlParams.get('subfolder') || '';
    const imageType = urlParams.get('type') || 'output';

    // Build upscale workflow
    const workflow = this.buildUpscaleWorkflow(filename, subfolder, imageType, targetWidth, targetHeight);

    // Queue the prompt
    const queueResponse = await fetch(`${this.serverUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: crypto.randomUUID()
      })
    });

    if (!queueResponse.ok) {
      const error = await queueResponse.text();
      throw new Error(`ComfyUI upscale queue error: ${error}`);
    }

    const responseData = await queueResponse.json();
    const promptId = responseData.prompt_id;

    if (!promptId) {
      throw new Error(`ComfyUI did not return a prompt_id for upscale`);
    }

    console.log(`[ComfyUI] ⏳ Upscale queued with ID: ${promptId}`);

    // Poll for completion
    const newImageUrl = await this.pollForResult(promptId);
    const generationTime = Date.now() - startTime;

    console.log(`[ComfyUI] ✅ Upscale complete! Processed in ${(generationTime / 1000).toFixed(1)}s`);

    return {
      url: newImageUrl,
      width: targetWidth,
      height: targetHeight,
      prompt: originalPrompt,
      provider: 'comfyui',
      generationTime
    };
  }

  /**
   * Build workflow for upscaling an existing image
   */
  private buildUpscaleWorkflow(filename: string, _subfolder: string, _imageType: string, targetWidth: number, targetHeight: number): Record<string, any> {
    return {
      "1": {
        "class_type": "LoadImage",
        "inputs": {
          "image": filename
        }
      },
      "2": {
        "class_type": "ImageScale",
        "inputs": {
          "image": ["1", 0],
          "upscale_method": "lanczos",
          "width": targetWidth,
          "height": targetHeight,
          "crop": "disabled"
        }
      },
      "3": {
        "class_type": "SaveImage",
        "inputs": {
          "filename_prefix": "StoryVerse_upscaled",
          "images": ["2", 0]
        }
      }
    };
  }

  private async pollForResult(promptId: string, maxAttempts = 300): Promise<string> {
    console.log(`[ComfyUI] Polling for result: ${promptId}`);

    for (let i = 0; i < maxAttempts; i++) {
      // Check history for completed prompt
      const historyResponse = await fetch(`${this.serverUrl}/history/${promptId}`);

      if (historyResponse.ok) {
        const history = await historyResponse.json();

        if (history[promptId]) {
          const promptData = history[promptId];

          // Check if there was an error
          if (promptData.status?.status_str === 'error') {
            throw new Error(`ComfyUI generation failed: ${JSON.stringify(promptData.status.messages)}`);
          }

          // Check if completed with outputs
          if (promptData.outputs) {
            const outputs = promptData.outputs;
            for (const nodeId of Object.keys(outputs)) {
              const nodeOutput = outputs[nodeId];
              if (nodeOutput.images && nodeOutput.images.length > 0) {
                const image = nodeOutput.images[0];
                const imageUrl = `${this.serverUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${image.type || 'output'}`;
                console.log(`[ComfyUI] Image ready: ${imageUrl}`);
                return imageUrl;
              }
            }
          }
        }
      }

      // Log progress every 10 attempts
      if (i % 10 === 0) {
        console.log(`[ComfyUI] Still waiting... (${i * 0.5}s elapsed)`);
      }

      // Wait 500ms before polling again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('ComfyUI generation timed out after 150 seconds');
  }

  private buildWorkflow(prompt: string, negativePrompt: string, preset: QualityPreset): Record<string, any> {
    // Use original proven settings: SDXL Base + euler sampler + normal scheduler
    const width = preset.width;
    const height = preset.height;
    const steps = preset.steps;
    const cfg = preset.cfg;
    const seed = Math.floor(Math.random() * 1000000000000);

    console.log(`[ComfyUI] ═══════════════════════════════════════`);
    console.log(`[ComfyUI] 🎨 Generating Image`);
    console.log(`[ComfyUI] ───────────────────────────────────────`);
    console.log(`[ComfyUI] Quality Tier: ${preset.tier} (${preset.name})`);
    console.log(`[ComfyUI] Resolution:   ${width}×${height}`);
    console.log(`[ComfyUI] Steps:        ${steps}`);
    console.log(`[ComfyUI] CFG Scale:    ${cfg}`);
    console.log(`[ComfyUI] Sampler:      euler`);
    console.log(`[ComfyUI] Scheduler:    normal`);
    console.log(`[ComfyUI] Model:        sd_xl_base_1.0.safetensors`);
    console.log(`[ComfyUI] Seed:         ${seed}`);
    console.log(`[ComfyUI] ───────────────────────────────────────`);
    console.log(`[ComfyUI] Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`[ComfyUI] ═══════════════════════════════════════`);

    return {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "cfg": cfg,
          "denoise": 1,
          "latent_image": ["5", 0],
          "model": ["4", 0],
          "negative": ["7", 0],
          "positive": ["6", 0],
          "sampler_name": "euler",
          "scheduler": "normal",
          "seed": seed,
          "steps": steps
        }
      },
      "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "sd_xl_base_1.0.safetensors"
        }
      },
      "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
          "batch_size": 1,
          "height": height,
          "width": width
        }
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["4", 1],
          "text": prompt
        }
      },
      "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["4", 1],
          "text": negativePrompt
        }
      },
      "8": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["3", 0],
          "vae": ["4", 2]
        }
      },
      "9": {
        "class_type": "SaveImage",
        "inputs": {
          "filename_prefix": "StoryVerse",
          "images": ["8", 0]
        }
      }
    };
  }

  private buildPrompt(basePrompt: string, style: ArtStyle): string {
    if (basePrompt.toLowerCase().includes('3d animated') || basePrompt.toLowerCase().includes('animation')) {
      return basePrompt;
    }
    const styleModifiers = style.promptModifiers.join(', ');
    return `Create a ${basePrompt}, ${styleModifiers}, safe for children, gentle and friendly, high quality, detailed`;
  }
}

/**
 * Main ImageGenerator class with provider switching
 */
export class ImageGenerator {
  private adapter: ImageProviderAdapter | null = null;
  private currentProvider: ImageProvider | null = null;
  private activeProvider: ImageProvider = 'imagen-4.0';
  private configs: Map<ImageProvider, string> = new Map();
  private generationCount: number = 0;
  private pauseAfterCount: number = 12;
  private isPaused: boolean = false;
  private pauseCallback: (() => Promise<boolean>) | null = null;
  private cachedFileReferences: FileReference[] = [];

  /**
   * Set the master provider for the entire application
   */
  setProvider(provider: ImageProvider): void {
    console.log(`[ImageGenerator] Switching master provider to: ${provider}`);
    this.activeProvider = provider;
    this.initAdapter(provider);
  }

  /**
   * Initialize the adapter for a given provider
   */
  private initAdapter(provider: ImageProvider): void {
    // ComfyUI doesn't need an API key, just a server URL
    if (provider === 'comfyui') {
      const serverUrl = this.configs.get('comfyui') || 'http://127.0.0.1:8188';
      this.adapter = new ComfyUIAdapter(serverUrl);
      this.currentProvider = provider;
      return;
    }

    const apiKey = this.configs.get(provider);
    if (!apiKey) {
      console.warn(`[ImageGenerator] API key not yet configured for provider: ${provider}`);
      return;
    }

    switch (provider) {
      case 'gemini-2.5-flash-files-upload':
        this.adapter = new Gemini25FlashFilesUploadAdapter(apiKey);
        break;
      case 'dalle3':
        this.adapter = new DallE3Adapter(apiKey);
        break;
      case 'gptimage':
        this.adapter = new GPTImageAdapter(apiKey, 'none');
        break;
      case 'gptimage-url':
        this.adapter = new GPTImageAdapter(apiKey, 'url');
        break;
      case 'gptimage-upload':
        this.adapter = new GPTImageAdapter(apiKey, 'upload');
        break;
      case 'gpt4o':
        this.adapter = new GPT4oImageAdapter(apiKey);
        break;
      case 'fal':
        this.adapter = new FalAdapter(apiKey);
        break;
      case 'replicate':
        this.adapter = new ReplicateAdapter(apiKey);
        break;
      case 'grok':
        this.adapter = new GrokAdapter(apiKey);
        break;
      case 'gemini':
      case 'gemini-2.0-flash':
        this.adapter = new GeminiImageAdapter(apiKey, 'none', 'gemini-2.5-flash-image', 'gemini');
        break;
      case 'gemini-url':
      case 'gemini-2.0-flash-url':
        this.adapter = new GeminiImageAdapter(apiKey, 'url', 'gemini-2.5-flash-image', 'gemini-url');
        break;
      case 'gemini-upload':
      case 'gemini-2.0-flash-upload':
        this.adapter = new GeminiImageAdapter(apiKey, 'upload', 'gemini-2.5-flash-image', 'gemini-upload');
        break;
      case 'gemini-files':
      case 'gemini-2.0-flash-files':
        this.adapter = new GeminiImageAdapter(apiKey, 'upload', 'gemini-2.5-flash-image', 'gemini-files');
        break;
      case 'gemini-2.5-flash':
        this.adapter = new GeminiImageAdapter(apiKey, 'none', 'gemini-2.5-flash-image', 'gemini-2.5-flash');
        break;
      case 'gemini-2.5-flash-url':
        this.adapter = new GeminiImageAdapter(apiKey, 'url', 'gemini-2.5-flash-image', 'gemini-2.5-flash-url');
        break;
      case 'gemini-2.5-flash-upload':
        this.adapter = new GeminiImageAdapter(apiKey, 'upload', 'gemini-2.5-flash-image', 'gemini-2.5-flash-upload');
        break;
      case 'gemini-2.5-flash-files':
        this.adapter = new GeminiImageAdapter(apiKey, 'upload', 'gemini-2.5-flash-image', 'gemini-2.5-flash-files');
        break;
      case 'gemini-3-pro':
        this.adapter = new GeminiImageAdapter(apiKey, 'none', 'gemini-3-pro-image-preview', 'gemini-3-pro');
        break;
      case 'gemini-3-pro-url':
        this.adapter = new GeminiImageAdapter(apiKey, 'url', 'gemini-3-pro-image-preview', 'gemini-3-pro-url');
        break;
      case 'gemini-3-pro-upload':
        this.adapter = new GeminiImageAdapter(apiKey, 'upload', 'gemini-3-pro-image-preview', 'gemini-3-pro-upload');
        break;
      case 'gemini-3-pro-files':
        this.adapter = new GeminiImageAdapter(apiKey, 'upload', 'gemini-3-pro-image-preview', 'gemini-3-pro-files');
        break;
      case 'imagen-3.0':
      case 'imagen-4.0':
        this.adapter = new Imagen3Adapter(apiKey, provider === 'imagen-4.0' ? 'imagen-4.0-generate-001' : 'imagen-4.0-generate-001');
        break;
      case 'vertex-imagen':
        this.adapter = new VertexImagenAdapter(apiKey, (import.meta as any).env.VITE_VERTEX_PROJECT_ID || 'your-project-id');
        break;
      default:
        console.warn(`[ImageGenerator] Unknown provider: ${provider}`);
    }
    this.currentProvider = provider;
  }

  /**
   * Configure a provider with its API key
   */
  setProviderConfig(provider: ImageProvider, apiKey: string): void {
    this.configs.set(provider, apiKey);

    // If this is the active provider and we don't have an adapter yet, initialize it
    if (provider === this.activeProvider && !this.adapter) {
      this.initAdapter(provider);
    }
  }

  /**
   * Set the pause callback function that will be called when the pause limit is reached
   * The callback should return a Promise<boolean> - true to continue, false to stop
   */
  setPauseCallback(callback: (() => Promise<boolean>) | null): void {
    this.pauseCallback = callback;
  }

  /**
   * Set cached file references from character optimization
   * These will be used automatically in image generation requests
   */
  setFileReferences(fileReferences: FileReference[]): void {
    this.cachedFileReferences = [...fileReferences];
    console.log(`[ImageGenerator] Cached ${fileReferences.length} file references for optimized generation`);
  }

  /**
   * Get currently cached file references
   */
  getCachedFileReferences(): FileReference[] {
    return [...this.cachedFileReferences];
  }

  /**
   * Clear cached file references
   */
  clearCachedFileReferences(): void {
    this.cachedFileReferences = [];
    console.log('[ImageGenerator] Cleared cached file references');
  }

  /**
   * Reset session-specific state
   */
  reset(): void {
    this.generationCount = 0;
    this.isPaused = false;
    this.cachedFileReferences = [];
    console.log('[ImageGenerator] Session state reset');
  }

  /**
   * Set the number of images to generate before pausing (default: 12)
   */
  setPauseAfterCount(count: number): void {
    this.pauseAfterCount = count;
  }

  /**
   * Get the current generation count
   */
  getGenerationCount(): number {
    return this.generationCount;
  }

  /**
   * Reset the generation count
   */
  resetGenerationCount(): void {
    this.generationCount = 0;
    this.isPaused = false;
  }

  /**
   * Check if currently paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Resume generation (clears pause state)
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Switch to a different provider
   */

  /**
   * Get current provider
   */
  getProvider(): ImageProvider | null {
    return this.activeProvider || this.currentProvider;
  }

  /**
   * Get list of configured providers
   */
  getConfiguredProviders(): ImageProvider[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Generate an image
   */
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    // Handle provider override for this request
    let currentAdapter = this.adapter;
    if (request.provider && request.provider !== this.currentProvider) {
      console.log(`[ImageGenerator] Overriding provider for this request: ${this.currentProvider} -> ${request.provider}`);

      // Temporarily create an adapter for the override provider
      const apiKey = this.configs.get(request.provider);
      if (apiKey) {
        // We'll use a local adapter instead of changing the global one
        const previousAdapter = this.adapter;
        const previousProvider = this.currentProvider;

        try {
          this.setProvider(request.provider);
          currentAdapter = this.adapter;
        } catch (e) {
          console.error(`[ImageGenerator] Failed to switch to override provider ${request.provider}:`, e);
          // Fallback to original adapter
          this.adapter = previousAdapter;
          this.currentProvider = previousProvider;
        }
      } else {
        console.warn(`[ImageGenerator] Provider override ${request.provider} requested but no API key configured.`);
      }
    }

    if (!currentAdapter) {
      // LAST RESORT: Try backend proxy if no adapter is configured
      const token = localStorage.getItem('auth_token');
      if (token && !request.referenceImages?.length) { // Backend proxy currently only supports text-to-image
        console.log('[ImageGenerator] No adapter configured, trying backend proxy...');
        try {
          const result = await backendGenerateImage(request.prompt, (request as any).storyId);
          if (result && result.success && result.b64_json) {
            const dataUrl = `data:image/png;base64,${result.b64_json}`;
            const dimensions = await getImageDimensions(dataUrl);
            this.generationCount++;
            return {
              url: dataUrl,
              width: dimensions.width,
              height: dimensions.height,
              prompt: request.prompt,
              provider: 'backend-proxy' as any,
              generationTime: 0 // Unknown
            };
          }
        } catch (e) {
          console.warn('[ImageGenerator] Backend proxy failed:', e);
        }
      }
      throw new Error('No image provider configured. Call setProviderConfig() first.');
    }

    // Merge cached file references with request file references
    const mergedRequest = { ...request };
    if (this.cachedFileReferences.length > 0) {
      const existingFileRefs = request.fileReferences || [];
      mergedRequest.fileReferences = [...this.cachedFileReferences, ...existingFileRefs];
      console.log(`[ImageGenerator] Using ${this.cachedFileReferences.length} cached + ${existingFileRefs.length} request file references`);
    }

    // Check if we need to pause before generating
    console.log(`[ImageGenerator] Current generation count: ${this.generationCount}/${this.pauseAfterCount}, isPaused: ${this.isPaused}`);
    if (this.generationCount >= this.pauseAfterCount && !this.isPaused) {
      this.isPaused = true;
      console.log(`[ImageGenerator] 🛑 Pausing after ${this.generationCount} images`);

      if (this.pauseCallback) {
        const shouldContinue = await this.pauseCallback();
        if (!shouldContinue) {
          throw new Error('Image generation stopped by user');
        }
        this.isPaused = false;
        console.log('[ImageGenerator] ▶️ Resuming image generation');
      } else {
        // No callback set, just log and continue
        console.log('[ImageGenerator] ⚠️ No pause callback set, continuing generation');
        this.isPaused = false;
      }
    }

    // If still paused (user didn't continue), throw error
    if (this.isPaused) {
      throw new Error('Image generation is paused');
    }

    // Retry logic - try up to 3 times on failure
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await currentAdapter.generate(mergedRequest);

        // Increment generation count on successful generation
        this.generationCount++;
        console.log(`[ImageGenerator] 📊 Generated image ${this.generationCount}/${this.pauseAfterCount} before next pause`);

        return result;
      } catch (error: any) {
        lastError = error;
        console.warn(`[ImageGenerator] Attempt ${attempt}/${maxRetries} failed:`, error.message);

        // Don't retry on content policy errors
        if (error.message?.includes('content policy') || error.message?.includes('safety')) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`[ImageGenerator] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Image generation failed after retries');
  }

  /**
   * Check if any provider is configured
   */
  isConfigured(): boolean {
    return this.adapter !== null;
  }

  /**
   * Interrupt current ComfyUI generation and clear queue
   * Call this before starting a new generation to cancel previous work
   */
  async interruptComfyUI(): Promise<void> {
    if (this.adapter && this.currentProvider === 'comfyui') {
      const comfyAdapter = this.adapter as ComfyUIAdapter;
      await comfyAdapter.interrupt();
      await comfyAdapter.clearQueue();
    }
  }

  /**
   * Set ComfyUI quality tier (S, M, L, XL)
   */
  setComfyUIQualityTier(tier: QualityTier): void {
    if (this.adapter && this.currentProvider === 'comfyui') {
      (this.adapter as ComfyUIAdapter).setQualityTier(tier);
    }
  }

  /**
   * Get current ComfyUI quality tier
   */
  getComfyUIQualityTier(): QualityTier | null {
    if (this.adapter && this.currentProvider === 'comfyui') {
      return (this.adapter as ComfyUIAdapter).getQualityTier();
    }
    return null;
  }

  /**
   * Set OpenAI image size (works for both DALL-E 3 and GPT Image)
   */
  setDallESize(size: DallESize): void {
    if (this.adapter && (this.currentProvider === 'dalle3' || this.currentProvider === 'gptimage')) {
      if (this.currentProvider === 'dalle3') {
        (this.adapter as DallE3Adapter).setSize(size);
      } else {
        (this.adapter as GPTImageAdapter).setSize(size);
      }
    }
  }

  /**
   * Get current OpenAI image size
   */
  getDallESize(): DallESize | null {
    if (this.adapter && this.currentProvider === 'dalle3') {
      return (this.adapter as DallE3Adapter).getSize();
    }
    if (this.adapter && this.currentProvider === 'gptimage') {
      return (this.adapter as GPTImageAdapter).getSize();
    }
    return null;
  }

  /**
   * Upscale an existing image (ComfyUI only)
   * Takes the original image and upscales it to target dimensions
   */
  async upscaleImage(imageUrl: string, targetWidth: number, targetHeight: number, originalPrompt: string): Promise<GeneratedImage> {
    if (this.currentProvider !== 'comfyui' || !this.adapter) {
      throw new Error('Upscaling is only supported with ComfyUI provider');
    }

    return (this.adapter as ComfyUIAdapter).upscale(imageUrl, targetWidth, targetHeight, originalPrompt);
  }

  /**
   * Upload reference images once for story session (Gemini 2.5 Flash Files Upload only)
   * This should be called at the beginning of a story to upload reference images once
   * and reuse them for multiple generations throughout the story.
   */
  async uploadReferenceImages(referenceImages: ReferenceImage[]): Promise<FileReference[]> {
    if (this.currentProvider !== 'gemini-2.5-flash-files-upload') {
      throw new Error('uploadReferenceImages is only supported with gemini-2.5-flash-files-upload provider');
    }

    if (!this.adapter) {
      throw new Error('No image provider configured. Call setProviderConfig() first.');
    }

    const filesUploadAdapter = this.adapter as Gemini25FlashFilesUploadAdapter;
    return await filesUploadAdapter.uploadReferenceImages(referenceImages);
  }

  /**
   * Clear cached file references (Gemini 2.5 Flash Files Upload only)
   */
  clearReferenceCache(): void {
    if (this.currentProvider === 'gemini-2.5-flash-files-upload' && this.adapter) {
      const filesUploadAdapter = this.adapter as Gemini25FlashFilesUploadAdapter;
      filesUploadAdapter.clearCache();
    }
  }

  /**
   * Get cached references count (Gemini 2.5 Flash Files Upload only)
   */
  getCachedReferencesCount(): number {
    if (this.currentProvider === 'gemini-2.5-flash-files-upload' && this.adapter) {
      const filesUploadAdapter = this.adapter as Gemini25FlashFilesUploadAdapter;
      return filesUploadAdapter.getCachedReferencesCount();
    }
    return 0;
  }

  /**
   * Check if upscaling is available
   */
  canUpscale(): boolean {
    return this.currentProvider === 'comfyui' && this.adapter !== null;
  }
}

/**
 * Singleton instance for easy access
 */
export const imageGenerator = new ImageGenerator();
