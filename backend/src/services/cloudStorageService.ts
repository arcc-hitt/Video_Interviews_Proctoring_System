import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary from environment variables if available
const hasCloudinaryConfig = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (hasCloudinaryConfig) {
	cloudinary.config({
		cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
		api_key: process.env.CLOUDINARY_API_KEY!,
		api_secret: process.env.CLOUDINARY_API_SECRET!,
		secure: true
	});
}

export interface CloudinaryUploadResult {
	url: string;
	publicId: string;
	duration?: number;
	bytes?: number;
	format?: string;
}

export class CloudStorageService {
	public isEnabled(): boolean {
		return hasCloudinaryConfig;
	}

	public async uploadVideo(filePath: string, options?: UploadApiOptions): Promise<CloudinaryUploadResult> {
		if (!this.isEnabled()) {
			throw new Error('Cloudinary not configured');
		}

		const uploadOptions: UploadApiOptions = {
			resource_type: 'video',
			folder: options?.folder || 'video-interviews/recordings',
			use_filename: true,
			unique_filename: true,
			overwrite: false,
			...options
		};
		// Use large upload for big files to improve reliability
		let res: UploadApiResponse;
		try {
			const stats = await fs.promises.stat(filePath);
			if (stats.size > 80 * 1024 * 1024) { // >80MB
				res = await cloudinary.uploader.upload_large(filePath, {
					chunk_size: 10_000_000, // 10MB chunks
					...uploadOptions
				}) as UploadApiResponse;
			} else {
				res = await cloudinary.uploader.upload(filePath, uploadOptions);
			}
		} catch (e) {
			// Fallback to regular upload if stat fails
			res = await cloudinary.uploader.upload(filePath, uploadOptions);
		}
		return {
			url: res.secure_url,
			publicId: res.public_id,
			duration: (res as any).duration,
			bytes: res.bytes,
			format: res.format
		};
	}

	/**
	 * Upload document (PDF, CSV, etc.) from buffer
	 */
	public async uploadDocument(buffer: Buffer, filename: string, options?: UploadApiOptions): Promise<CloudinaryUploadResult> {
		if (!this.isEnabled()) {
			throw new Error('Cloudinary not configured');
		}

		const baseOptions = {
			resource_type: 'raw' as const,
			folder: options?.folder || 'video-interviews/reports',
			use_filename: true,
			unique_filename: true,
			overwrite: false
		};

		const publicId = options?.public_id || filename.split('.')[0];
		
		const uploadOptions = {
			...baseOptions,
			...options,
			public_id: publicId
		} as UploadApiOptions;

		return new Promise((resolve, reject) => {
			cloudinary.uploader.upload_stream(
				uploadOptions,
				(error, result) => {
					if (error) {
						reject(error);
					} else if (result) {
						resolve({
							url: result.secure_url,
							publicId: result.public_id,
							bytes: result.bytes,
							format: result.format
						});
					} else {
						reject(new Error('Upload failed - no result'));
					}
				}
			).end(buffer);
		});
	}

	/**
	 * Upload document from file path
	 */
	public async uploadDocumentFromPath(filePath: string, options?: UploadApiOptions): Promise<CloudinaryUploadResult> {
		if (!this.isEnabled()) {
			throw new Error('Cloudinary not configured');
		}

		const uploadOptions: UploadApiOptions = {
			resource_type: 'raw',
			folder: options?.folder || 'video-interviews/reports',
			use_filename: true,
			unique_filename: true,
			overwrite: false,
			...options
		};

		const res = await cloudinary.uploader.upload(filePath, uploadOptions);
		return {
			url: res.secure_url,
			publicId: res.public_id,
			bytes: res.bytes,
			format: res.format
		};
	}

	/**
	 * Delete file from Cloudinary
	 */
	public async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'raw'): Promise<void> {
		if (!this.isEnabled()) {
			throw new Error('Cloudinary not configured');
		}

		await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
	}
}

export const cloudStorageService = new CloudStorageService();
