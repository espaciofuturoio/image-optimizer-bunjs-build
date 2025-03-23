FROM oven/bun
WORKDIR /usr/src/app

ENV HUSKY=0
ENV NODE_ENV=production
# Cloud Run will set PORT environment variable
ENV HOST=0.0.0.0

COPY package.json bun.lock tsconfig.json ./
RUN bun install --production
COPY . .
RUN bun run build

# Use CMD as an array of string arguments
CMD [ "bun", "run", "src/index.tsx" ]