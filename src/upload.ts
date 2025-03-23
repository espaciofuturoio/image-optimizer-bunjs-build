export type UploadResponse = {
	result: {
		id: string;
		filename: string;
		meta: Record<string, string>;
		uploaded: string;
		requireSignedURLs: boolean;
		variants: string[];
	};
	success: boolean;
	errors: string[];
	messages: string[];
};

export const uploadImage = async (
	file: File,
	metadata: Record<string, object> = {},
	requireSignedURLs = false,
): Promise<UploadResponse> => {
	const url = "/api";

	const formData = new FormData();
	formData.append("file", file);
	formData.append("metadata", JSON.stringify(metadata));
	formData.append("requireSignedURLs", JSON.stringify(requireSignedURLs));

	try {
		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			throw new Error("Failed to upload image to the server");
		}

		const data = await response.json();
		console.log("Upload successful", data);
		return data;
	} catch (error) {
		console.error("Error uploading image to the server:", error);
		throw error; // Rethrow the error to be handled by the caller
	}
};
