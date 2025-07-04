# Multi-stage build for optimized production image
# Stage 1: Builder - Build the application
FROM node:18-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package.json, package-lock.json, tsconfig.json to leverage Docker cache
COPY package.json package-lock.json tsconfig.json ./

# Install dependencies using npm ci for production builds
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY examples/ ./examples/ # Copy examples if they are needed at runtime (e.g. for default configs)

# Build the application
# This will compile TypeScript to JavaScript in the `dist` directory
RUN npm run build

# Stage 2: Production - Create a lean runtime image
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Create a non-root user for security best practices
# UID/GID 1001 is common for non-root users in containers
RUN addgroup -g 1001 -S nodejs && \
    adduser -S jsdoc -u 1001 -G nodejs

# Copy only the necessary files from the builder stage
# These include compiled JS, production node_modules, and essential config/package files
COPY --from=builder --chown=jsdoc:nodejs /app/dist ./dist
COPY --from=builder --chown=jsdoc:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=jsdoc:nodejs /app/package.json ./package.json
# Copy example configurations if they are used by the CLI (e.g. for `monodoc setup`)
COPY --from=builder --chown=jsdoc:nodejs /app/examples/ ./examples/
# Copy the default config file if it's external (e.g., config/jsdoc-config.yaml)
# If your default config is entirely internal to the JS, this might not be needed.
# If you allow loading custom configs, then copying `config/` could be useful.
COPY --from=builder --chown=jsdoc:nodejs /app/config/ ./config/
# Copy docs that might be referenced by the CLI (e.g. README.MD for general info)
COPY --from=builder --chown=jsdoc:nodejs /app/README.MD ./README.MD


# Create necessary directories for runtime operation and ensure correct ownership
# For reports and cache, they should be writable by the `jsdoc` user.
RUN mkdir -p /app/reports /app/.jsdoc-cache /app/.jsdoc-telemetry && \
    chown -R jsdoc:nodejs /app/reports /app/.jsdoc-cache /app/.jsdoc-telemetry

# Switch to the non-root user
USER jsdoc

# Health check to verify the application starts and responds
# This command checks if the CLI can successfully print its version
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/src/cli.js --version || exit 1

# Set environment variables for production
ENV NODE_ENV=production
ENV LOG_LEVEL=info # Default log level in production containers

# Expose port (if your CLI will ever run as a service, though unlikely for this tool)
# EXPOSE 3000

# Default command to run when the container starts
# It runs the CLI with `--help` by default, so users can see options
ENTRYPOINT ["node", "dist/src/cli.js"]
CMD ["info", "--quick-start"] # Shows quick start guide by default

