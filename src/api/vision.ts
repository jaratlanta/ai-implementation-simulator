/**
 * Vision API utilities for describing images
 * Supports Google Gemini (primary) and OpenAI GPT-4o (fallback)
 */

export interface ImageDescriptionResult {
  success: boolean;
  description?: string;
  error?: string;
  provider?: 'gemini' | 'openai';
}

export type VisionProvider = 'gemini' | 'auto';

export interface TextRefinementResult {
  success: boolean;
  refinedText?: string;
  error?: string;
}


/**
 * Describe a person/character in an image
 * @param imageBase64 - Base64 encoded image data (without data URL prefix)
 * @param mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png')
 * @param characterType - Type of character to describe
 * @param provider - Which API to use ('gemini', 'openai', or 'auto')
 */
export async function describeImageForCharacter(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  characterType: 'person' | 'animal' | 'creature' | 'object' = 'person',
  provider: VisionProvider = 'auto'
): Promise<ImageDescriptionResult> {
  const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || localStorage.getItem('gemini_api_key');

  if (provider === 'auto' || provider === 'gemini') {
    const result = await describeWithGemini(imageBase64, mimeType, characterType, geminiKey!);
    return result;
  } else {
    return {
      success: false,
      error: 'Unsupported vision provider. Gemini is the only supported provider.'
    };
  }
}

/**
 * Refine an image description using Gemini Vision
 */
export async function refineImageWithVision(
  imageBase64: string,
  mimeType: string,
  refinementRequest: string,
  characterType: 'person' | 'animal' | 'creature' | 'object' = 'person'
): Promise<ImageDescriptionResult> {
  const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || localStorage.getItem('gemini_api_key');

  if (!geminiKey) {
    return { success: false, error: 'No Gemini API key found' };
  }

  const prompt = `You are an expert at refining character descriptions for AI image generation. 
The user has an existing character image and wants to make changes.

REFINEMENT REQUEST: "${refinementRequest}"

INSTRUCTIONS:
1. Analyze the attached image.
2. Incorporate the user's refinement request into a new, single-paragraph character description.
3. Keep the original character's essence unless the request asks to change it.
4. Output ONLY the new description, no preamble.
5. Provide a stylized, iconic 3D animated description.
6. STYLIZED HERO AESTHETICS: Ensure the character looks like an idealized, highly appealing lead of a 3D animated film. Capture their distinctive face shape and features for a clear recognizable likeness. For men, emphasize heroic, handsome, or dashing features; for women, emphasize elegant, stunning, and beautiful features. Focus on expressive features and vibrant character design. Avoid realistic textures, wrinkles, or frumpy details. Think "charismatic 3D character model", not "real person".

REFINED DESCRIPTION:`;

  return describeWithGemini(imageBase64, mimeType, characterType, geminiKey, prompt);
}

/**
 * Refine a raw speech transcript into a flowing character description
 * @param text - The raw transcript text
 */
export async function refineTextDescription(text: string): Promise<TextRefinementResult> {
  const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || localStorage.getItem('gemini_api_key');

  if (!geminiKey) {
    return {
      success: false,
      error: 'No Gemini API key found'
    };
  }

  const prompt = `You are an expert at cleaning up raw voice transcripts for character descriptions in a children's storybook. 
Your goal is to take the raw, slightly messy spoken input and turn it into 3-4 flowing sentences of clear visual description.

RAW INPUT: "${text}"

INSTRUCTIONS:
1. Fix grammar, punctuation, and stuttering.
2. Ensure the description is purely visual and descriptive.
3. Don't add features that weren't mentioned, but make the mentioned features sound more illustrative (e.g., instead of "blue eyes", maybe "bright ocean-blue eyes").
4. Keep the 3D animated character context in mind.
5. Provide ONLY the refined text, no preamble.

REFINED DESCRIPTION:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error?.message || 'Gemini API error' };
    }

    const data = await response.json();
    const refinedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (refinedText) {
      return { success: true, refinedText };
    }

    return { success: false, error: 'No refined text returned' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to refine text' };
  }
}

/**
 * Describe image using Google Gemini API
 */
async function describeWithGemini(
  imageBase64: string,
  mimeType: string,
  characterType: string,
  apiKey: string,
  customPrompt?: string
): Promise<ImageDescriptionResult> {
  if (!apiKey) {
    return {
      success: false,
      error: 'No Gemini API key found'
    };
  }

  const prompt = customPrompt || buildPrompt(characterType);

  try {
    console.log('[Vision] Sending image to Google Gemini API...');

    const tryModels = ['gemini-2.5-flash', 'gemini-2.0-flash-001'];
    let lastError = '';

    for (const model of tryModels) {
      console.log(`[Vision] Trying model: ${model}`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64
                  }
                },
                { text: prompt }
              ]
            }]
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (description) {
          console.log(`[Vision] Got description from ${model}:`, description);
          return {
            success: true,
            description,
            provider: 'gemini'
          };
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        lastError = `Gemini API error (${model}): ${response.status} - ${errorData.error?.message || 'Unknown error'}`;
        console.warn(`[Vision] ${model} failed:`, response.status, errorData);

        // Only continue to next model if this was a rate limit (429) or not found (404)
        if (response.status !== 429 && response.status !== 404 && response.status !== 400) {
          break;
        }

        // Add a small delay if it's a 429 before trying the next model
        if (response.status === 429) {
          console.log(`[Vision] Rate limited on ${model}, waiting 1 second before next try...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    return {
      success: false,
      error: lastError || 'All Gemini models failed',
      provider: 'gemini'
    };
  } catch (error: any) {
    console.error('[Vision] Gemini failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to process image with Gemini',
      provider: 'gemini'
    };
  }
}

/**
        provider: 'openai'
      };
    }

    return {
      success: false,
      error: 'No description returned from OpenAI API',
      provider: 'openai'
    };
  } catch (error: any) {
    console.error('[Vision] OpenAI failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to process image with OpenAI',
      provider: 'openai'
    };
  }
}

/**
 * Build the prompt based on character type
 */
function buildPrompt(characterType: string): string {
  const typePrompts: Record<string, string> = {
    person: `You are an expert at describing people for children's storybook illustrations. Analyze this photo and provide a DETAILED visual description suitable for creating a 3D animated character.

DESCRIBE IN DETAIL:
1. HAIR: Color (be specific - golden blonde, chestnut brown, jet black, etc.), texture (straight, wavy, curly, coily), length, style (ponytail, braids, short crop, etc.)
2. FACE: Face shape, eye color and shape, eyebrow style, nose shape, lip shape, any distinctive features (dimples, freckles, beauty marks)
3. SKIN: Skin tone (use descriptive terms like warm caramel, fair with rosy cheeks, deep brown, olive, etc.)
4. BUILD: Body type and approximate age range (toddler, young child, tween, teen, young adult, adult, elderly)
5. EXPRESSION: Default expression or personality that shows through (cheerful, thoughtful, mischievous, kind, etc.)
6. CLOTHING/ACCESSORIES: If visible, describe style, colors, and any accessories (glasses, jewelry, hat, etc.)
7. STYLIZED HERO AESTHETICS: This is a 3D animated character, so describe them with idealized, iconic, and highly appealing features. Capture their distinctive face shape and features for a clear recognizable likeness. For men, emphasize heroic, handsome, or dashing features; for women, emphasize elegant, stunning, and beautiful features. Focus on vibrant colors and big expressive eyes. Even for older characters, emphasize the smooth surfaces and appealing structure typical of high-quality animation. AVOID anatomical realism, "wrinkles", or "frumpy" details. Think "charismatic lead character model".

FORMAT: Write 3-4 sentences of flowing description, NOT a bulleted list. Be specific about colors and features. Do NOT mention "the photo" or "the image" - just describe the person directly as if describing a character.

Example good output: "A cheerful young girl around 8 years old with warm brown skin and big, expressive dark brown eyes framed by long lashes. Her thick, curly black hair is styled in two playful puffs with colorful beads. She has a button nose, full lips that seem ready to break into a smile, and a small dimple on her left cheek. She wears round purple glasses and a bright yellow t-shirt."`,

    animal: `You are an expert at describing animals for children's storybook illustrations. Analyze this photo and provide a DETAILED visual description suitable for creating a 3D animated character.

DESCRIBE IN DETAIL:
1. SPECIES/BREED: Be specific (golden retriever, tabby cat, Holland lop rabbit, etc.)
2. FUR/FEATHERS/SCALES: Color patterns, texture, markings (spots, stripes, patches)
3. EYES: Color, shape, expression
4. SIZE: Small, medium, large relative to their species
5. DISTINCTIVE FEATURES: Ear shape, tail, whiskers, any unique markings
6. PERSONALITY: What personality traits show through their appearance (playful, wise, curious, etc.)
7. ACCESSORIES: Collar, tags, bows, or other items if visible

FORMAT: Write 3-4 sentences of flowing description. Be specific about colors and patterns. Do NOT mention "the photo" - describe the animal directly.

Example good output: "A fluffy orange tabby cat with striking amber eyes and distinctive M-shaped markings on his forehead. His fur is a warm marmalade color with cream-colored patches on his chest and paws. He has a pink nose, long white whiskers, and ears that perk up alertly. His expression is curious and slightly mischievous, with a fluffy tail that curls at the tip."`,

    creature: `You are an expert at describing fantastical creatures for children's storybook illustrations. Analyze this image and provide a DETAILED visual description suitable for creating a 3D animated character.

DESCRIBE IN DETAIL:
1. OVERALL FORM: Basic shape, size, proportions
2. COLORS: Primary and secondary colors, any patterns or gradients
3. TEXTURES: Smooth, scaly, furry, crystalline, etc.
4. DISTINCTIVE FEATURES: Wings, horns, tails, multiple eyes, etc.
5. MAGICAL ELEMENTS: Glowing parts, sparkles, ethereal qualities
6. PERSONALITY: What personality shows through the design (friendly, mysterious, playful, wise)

FORMAT: Write 3-4 sentences of flowing description. Be imaginative but specific. Do NOT mention "the image" - describe the creature directly.`,

    object: `You are an expert at describing objects that will become animated characters in children's storybooks. Analyze this image and provide a DETAILED visual description suitable for creating a 3D animated character (like animated toy or vehicle characters).

DESCRIBE IN DETAIL:
1. SHAPE/FORM: Basic shape and proportions
2. COLORS: Primary colors, accents, patterns
3. MATERIALS: What it appears to be made of (plastic, metal, fabric, wood, etc.)
4. FACE AREA: Where eyes and mouth could be animated
5. DISTINCTIVE FEATURES: Unique details that give it personality
6. CHARACTER POTENTIAL: What personality this object might have when animated

FORMAT: Write 3-4 sentences of flowing description. Be specific about colors and details. Do NOT mention "the image" - describe the object directly.`
  };

  return typePrompts[characterType] || typePrompts.person;
}

/**
 * Convert a File to base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Resize an image to reduce size before sending to API
 */
export function resizeImage(file: File, maxWidth: number = 512, maxHeight: number = 512): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));

    // Create object URL from file
    img.src = URL.createObjectURL(file);
  });
}
