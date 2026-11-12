# Use Node.js to build the React application
FROM node:22-alpine AS build

# Set the frontend working directory
WORKDIR /app

# Configure the backend API URL during the build
ARG VITE_API_BASE_URL=http://localhost:8000/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Install frontend dependencies
COPY package*.json ./
RUN npm ci

# Copy frontend source code
COPY . .

# Create the production frontend build
RUN npm run build

# Use the official unprivileged NGINX image
FROM nginx/nginx-unprivileged:stable-alpine

# Copy the frontend build into the NGINX web directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose the unprivileged NGINX port
EXPOSE 8080