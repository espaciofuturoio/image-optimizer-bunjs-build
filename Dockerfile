FROM oven/bun
WORKDIR /usr/src/app

ENV HUSKY=0
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json bun.lock tsconfig.json ./
RUN bun install --production
COPY . .
RUN bun run build
CMD [ "bun", "src/index.tsx" ]