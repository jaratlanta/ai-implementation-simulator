/**
 * Persistent Reference Image Manager for Gemini Files API
 * Handles uploading reference images once and reusing them throughout a story session
 */

export interface PersistentReferenceImage {
  /** Gemini Files API URI (e.g., "files/abc123") */
  fileUri: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Optional description of what this reference represents */
  description?: string;
  /** Character label for prompt (WOMAN, MAN, DOG, etc.) */
  label?: string;
  /** Upload timestamp */
  uploadedAt: Date;
  /** Expiry timestamp (Files API default is 48 hours) */
  expiresAt: Date;
}

export interface UploadReferenceRequest {
  /** Base64 encoded image data (without data URL prefix) */
  base64: string;
  /** MIME type of the image */
  mimeType: string;
  /** Filename for the upload */
  filename: string;
  /** Optional description */
  description?: string;
  /** Optional character label */
  label?: string;
}

/**
 * Manager for persistent reference images using Gemini Files API
 */
export class PersistentReferenceManager {
  private apiKey: string;
  private uploadedReferences: Map<string, PersistentReferenceImage> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Upload a reference image to Gemini Files API for persistent use
   * Returns the file URI that can be reused in multiple requests
   */
  async uploadReference(request: UploadReferenceRequest): Promise<PersistentReferenceImage> {
    console.log(`[PersistentRef] Uploading reference image: ${request.filename}`);
    
    // Convert base64 to binary for upload
    const binaryString = atob(request.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const numBytes = bytes.length;
    const mimeType = request.mimeType;
    const displayName = request.filename;

    try {
      // Step 1: Initial resumable request defining metadata
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
            file: {
              display_name: displayName
            }
          })
        }
      );

      if (!initialResponse.ok) {
        const error = await initialResponse.json().catch(() => ({ error: { message: initialResponse.statusText } }));
        throw new Error(`Files API initial request failed: ${error.error?.message || initialResponse.statusText}`);
      }

      // Get upload URL from response headers
      const uploadUrl = initialResponse.headers.get('X-Goog-Upload-URL');
      if (!uploadUrl) {
        throw new Error('No upload URL returned from Files API');
      }

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

      // Create persistent reference record
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (48 * 60 * 60 * 1000)); // 48 hours default
      
      const persistentRef: PersistentReferenceImage = {
        fileUri: data.file.uri,
        filename: request.filename,
        mimeType: request.mimeType,
        description: request.description,
        label: request.label,
        uploadedAt: now,
        expiresAt: expiresAt
      };

      // Store in memory for this session
      this.uploadedReferences.set(data.file.uri, persistentRef);

      console.log(`[PersistentRef] ✅ Uploaded successfully: ${data.file.uri}`);
      console.log(`[PersistentRef] Expires: ${expiresAt.toISOString()}`);

      return persistentRef;
    } catch (error: any) {
      console.error(`[PersistentRef] Upload failed:`, error);
      throw error;
    }
  }

  /**
   * Get all uploaded reference images for this session
   */
  getUploadedReferences(): PersistentReferenceImage[] {
    return Array.from(this.uploadedReferences.values())
      .filter(ref => ref.expiresAt > new Date()) // Only return non-expired
      .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
  }

  /**
   * Get a specific reference by file URI
   */
  getReference(fileUri: string): PersistentReferenceImage | null {
    const ref = this.uploadedReferences.get(fileUri);
    if (ref && ref.expiresAt > new Date()) {
      return ref;
    }
    return null;
  }

  /**
   * Remove a reference from the session (doesn't delete from Gemini)
   */
  removeReference(fileUri: string): boolean {
    return this.uploadedReferences.delete(fileUri);
  }

  /**
   * Clear all references from the session
   */
  clearAllReferences(): void {
    this.uploadedReferences.clear();
  }

  /**
   * Delete a file from Gemini Files API
   * Note: Files auto-expire after 48 hours, so this is optional
   */
  async deleteReference(fileUri: string): Promise<void> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${this.apiKey}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        console.warn(`[PersistentRef] Delete failed: ${error.error?.message || response.statusText}`);
      } else {
        console.log(`[PersistentRef] ✅ Deleted: ${fileUri}`);
      }
    } catch (error) {
      console.warn(`[PersistentRef] Delete error:`, error);
    } finally {
      // Remove from local cache regardless
      this.uploadedReferences.delete(fileUri);
    }
  }

  /**
   * Check if any references are expired and remove them from cache
   */
  cleanupExpiredReferences(): void {
    const now = new Date();
    const expired: string[] = [];
    
    for (const [uri, ref] of this.uploadedReferences.entries()) {
      if (ref.expiresAt <= now) {
        expired.push(uri);
      }
    }
    
    for (const uri of expired) {
      this.uploadedReferences.delete(uri);
      console.log(`[PersistentRef] Removed expired reference: ${uri}`);
    }
  }

  /**
   * Convert persistent references to the format expected by image generation
   * This creates file URI references instead of base64 inline data
   */
  convertToFileReferences(persistentRefs: PersistentReferenceImage[]): FileReference[] {
    return persistentRefs.map(ref => ({
      fileUri: ref.fileUri,
      description: ref.description,
      label: ref.label
    }));
  }
}

/**
 * File reference for use in image generation requests
 * Uses Gemini Files API URI instead of base64 data
 */
export interface FileReference {
  /** Gemini Files API URI */
  fileUri: string;
  /** Optional description */
  description?: string;
  /** Character label for prompt */
  label?: string;
}