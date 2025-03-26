import { z } from "zod";

const envSchema = z.object({
	PUBLIC_SERVER_URL: z.string().url().default("http://localhost:3000"),
	UPLOAD_DIR: z.string().default("uploads"),
	NODE_ENV: z.enum(["development", "production"]).default("production"),
	PORT: z.coerce.number().default(3000),
	CDN_BASE_URL: z.string().url().optional(),
});

let ENV: z.infer<typeof envSchema>;

try {
	ENV = envSchema.parse(Bun.env);
	const {
		PUBLIC_SERVER_URL,
		UPLOAD_DIR,
		NODE_ENV,
		PORT,
		CDN_BASE_URL,
		...secrets
	} = ENV;
	console.log("ENVIRONMENT VARIABLES");
	console.dir(
		{
			PUBLIC_SERVER_URL,
			UPLOAD_DIR,
			NODE_ENV,
			PORT,
			CDN_BASE_URL,
		},
		{ depth: null },
	);
	if (ENV.NODE_ENV !== "production") {
		console.log("SECRETS");
		console.dir(secrets, { depth: null });
	}
} catch (error) {
	if (error instanceof z.ZodError) {
		console.error(error.issues);
	}
}

export { ENV };
