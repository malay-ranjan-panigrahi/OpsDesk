// Define the OpsDesk CI pipeline
pipeline {

    // Run the pipeline on an available Jenkins node
    agent any

    // Configure pipeline execution behavior
    options {
        skipDefaultCheckout(true)
        timestamps()
        disableConcurrentBuilds()
    }

    // Define runtime parameters
    parameters {
        booleanParam(
            name: 'RUN_QUALITY_CHECKS',
            defaultValue: true,
            description: 'Run frontend and backend quality checks?'
        )

        booleanParam(
            name: 'PUSH_IMAGES',
            defaultValue: false,
            description: 'Push Docker images to Docker Hub?'
        )
    }

    // Define reusable pipeline environment variables
    environment {
        BACKEND_IMAGE = 'malaynew07/opsdesk-backend'
        FRONTEND_IMAGE = 'malaynew07/opsdesk-frontend'
        IMAGE_TAG = "${BUILD_NUMBER}"
        VITE_API_BASE_URL = 'http://localhost:8000/api/v1'
    }

    stages {

        // Retrieve application source code from Git
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // Run independent application quality checks in parallel
        stage('Quality Checks') {
            when {
                expression {
                    params.RUN_QUALITY_CHECKS == true
                }
            }

            parallel {

                // Validate frontend code and production build
                stage('Frontend Checks') {
                    steps {
                        dir('frontend') {
                            sh '''
                                npm ci
                                npm run lint
                                npm run build
                            '''
                        }
                    }
                }

                // Validate backend Python source syntax
                stage('Backend Syntax Check') {
                    steps {
                        dir('backend') {
                            sh 'python3 -m compileall -q app'
                        }
                    }
                }
            }
        }

        // Build backend and frontend Docker images in parallel
        stage('Build Docker Images') {
            parallel {

                // Build the FastAPI backend image
                stage('Backend Image Build') {
                    steps {
                        sh '''
                            docker build --pull \
                              -t "$BACKEND_IMAGE:$IMAGE_TAG" \
                              ./backend
                        '''
                    }
                }

                // Build the React frontend image
                stage('Frontend Image Build') {
                    steps {
                        sh '''
                            docker build --pull \
                              --build-arg VITE_API_BASE_URL="$VITE_API_BASE_URL" \
                              -t "$FRONTEND_IMAGE:$IMAGE_TAG" \
                              ./frontend
                        '''
                    }
                }
            }
        }

        // Scan both Docker images for security vulnerabilities
        stage('Trivy Security Scan') {
            parallel {

                // Scan the backend image
                stage('Backend Image Scan') {
                    steps {
                        sh '''
                            trivy image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --exit-code 1 \
                              "$BACKEND_IMAGE:$IMAGE_TAG"
                        '''
                    }
                }

                // Scan the frontend image
                stage('Frontend Image Scan') {
                    steps {
                        sh '''
                            trivy image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --exit-code 1 \
                              "$FRONTEND_IMAGE:$IMAGE_TAG"
                        '''
                    }
                }
            }
        }

        // Push scanned images to Docker Hub
        stage('Push Docker Images') {
            when {
                expression {
                    params.PUSH_IMAGES == true
                }
            }

            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-hub-creds',
                        usernameVariable: 'DOCKERHUB_USER',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    // Authenticate and push versioned images securely
                    sh '''
                        set +x

                        # Authenticate with Docker Hub
                        echo "$DOCKERHUB_TOKEN" | docker login \
                          --username "$DOCKERHUB_USER" \
                          --password-stdin

                        # Log out after the push operation
                        trap 'docker logout >/dev/null 2>&1 || true' EXIT

                        # Push the backend image
                        docker push "$BACKEND_IMAGE:$IMAGE_TAG"

                        # Push the frontend image
                        docker push "$FRONTEND_IMAGE:$IMAGE_TAG"
                    '''
                }
            }
        }
    }

    // Handle pipeline completion and report the actual result
    post {

        success {
            script {
                if (params.PUSH_IMAGES) {
                    echo "SUCCESS: OpsDesk images pushed with tag ${IMAGE_TAG}."
                } else {
                    echo 'SUCCESS: CI completed. Docker Hub push was skipped.'
                }
            }
        }

        failure {
            echo 'FAILED: Pipeline stopped. Check the failed stage logs.'
        }

        always {
            echo 'OpsDesk CI pipeline execution finished.'
        }
    }
}
