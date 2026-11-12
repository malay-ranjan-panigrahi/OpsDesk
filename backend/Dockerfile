# Use a slim Python base image
FROM python:3.14-slim

# Set the application working directory
WORKDIR /app

# Configure Python runtime behavior
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install backend dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source code
COPY . .

# Create a non-root application User
RUN groupadd --system app && \
    useradd --system --gid app --create-home app && \
    chown -R app:app /app

# Run the application without root privileges
USER app

# Expose the FastAPI application port
EXPOSE 8000

# Start the FastAPI application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
