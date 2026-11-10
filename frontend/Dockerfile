
# Use Node.js to build the React application
FROM node:22-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy frontend source code
COPY . .

# Build the production frontend
RUN npm run build

# Use Nginx to serve the production build
FROM nginx:alpine

# Copy build output to Nginx web directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose frontend port
EXPOSE 80

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
