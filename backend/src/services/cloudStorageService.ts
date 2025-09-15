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
}

export const cloudStorageService = new CloudStorageService();
