# Use a slim Python base image
FROM python:3.14-slim

# Set the application working directory
WORKDIR /app

# Configure Python runtime behavior
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Apply available Debian security updates
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install backend application dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Remove pip and its bundled development components from the runtime image
RUN python -m pip uninstall -y pip

# Copy backend application source code
COPY . .

# Create a dedicated non-root application user
RUN groupadd --system app \
    && useradd --system --gid app --create-home app \
    && chown -R app:app /app

# Run the application without root privileges
USER app

# Expose the FastAPI application port
EXPOSE 8000

# Start the FastAPI application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
