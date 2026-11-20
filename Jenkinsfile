// Define the OpsDesk CI/CD pipeline
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
            description: 'Push Docker images to Docker Hub and update GitOps?'
        )
    }

    // Define reusable pipeline environment variables
    environment {
        BACKEND_IMAGE = 'malaynew07/opsdesk-backend'
        FRONTEND_IMAGE = 'malaynew07/opsdesk-frontend'
        IMAGE_TAG = "${BUILD_NUMBER}"
        VITE_API_BASE_URL = '/api/v1'
        GITOPS_REPOSITORY = 'https://github.com/malay-ranjan-panigrahi/opsdesk-k8s.git'
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
                                set -eu
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
                            sh '''
                                set -eu
                                python3 -m compileall -q app
                            '''
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
                            set -eu
                            docker build --pull \\
                              --build-arg APT_CACHE_BUST="$BUILD_NUMBER" \\
                              -t "$BACKEND_IMAGE:$IMAGE_TAG" \\
                              ./backend
                        '''
                    }
                }

                // Build the React frontend image
                stage('Frontend Image Build') {
                    steps {
                        sh '''
                            set -eu
                            docker build --pull \\
                              --build-arg VITE_API_BASE_URL="$VITE_API_BASE_URL" \\
                              -t "$FRONTEND_IMAGE:$IMAGE_TAG" \\
                              ./frontend
                        '''
                    }
                }
            }
        }

        // Trivy security scan is intentionally retained as disabled for now.
        // Enable this stage after confirming Trivy is installed on the Jenkins agent
        // and the vulnerability gate policy is agreed.
        // stage('Trivy Security Scan') {
        //     steps {
        //         script {
        //             def backendScanStatus = sh(
        //                 script: '''
        //                     trivy image \\
        //                       --scanners vuln \\
        //                       --severity HIGH,CRITICAL \\
        //                       --exit-code 1 \\
        //                       "$BACKEND_IMAGE:$IMAGE_TAG"
        //                 ''',
        //                 returnStatus: true
        //             )
        //
        //             def frontendScanStatus = sh(
        //                 script: '''
        //                     trivy image \\
        //                       --scanners vuln \\
        //                       --severity HIGH,CRITICAL \\
        //                       --exit-code 1 \\
        //                       "$FRONTEND_IMAGE:$IMAGE_TAG"
        //                 ''',
        //                 returnStatus: true
        //             )
        //
        //             if (backendScanStatus != 0 || frontendScanStatus != 0) {
        //                 error(
        //                     "Security gate failed. Backend scan: ${backendScanStatus}, " +
        //                     "Frontend scan: ${frontendScanStatus}"
        //                 )
        //             }
        //
        //             echo 'Security gate passed. Both Docker images passed the scan.'
        //         }
        //     }
        // }

        // Push built images to Docker Hub when explicitly enabled
        stage('Push Docker Images') {
            when {
                expression {
                    params.PUSH_IMAGES == true
                }
            }

            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-hub-cred',
                        usernameVariable: 'DOCKERHUB_USER',
                        passwordVariable: 'DOCKERHUB_TOKEN'
                    )
                ]) {
                    sh '''
                        set +x
                        set -eu

                        printf '%s' "$DOCKERHUB_TOKEN" | docker login \\
                          --username "$DOCKERHUB_USER" \\
                          --password-stdin

                        trap 'docker logout >/dev/null 2>&1 || true' EXIT

                        docker push "$BACKEND_IMAGE:$IMAGE_TAG"
                        docker push "$FRONTEND_IMAGE:$IMAGE_TAG"
                    '''
                }
            }
        }

        // Update the GitOps repository so Argo CD can deploy the new image tags
        stage('Update GitOps Repository') {
            when {
                expression {
                    params.PUSH_IMAGES == true
                }
            }

            steps {
                dir('gitops') {
                    // Start with a clean GitOps checkout directory
                    deleteDir()

                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: '*/main']],
                        userRemoteConfigs: [[
                            url: "${GITOPS_REPOSITORY}",
                            credentialsId: 'github-opsdesk-gitops'
                        ]]
                    ])

                    // Update only the backend and frontend image tags in values.yaml
                    sh '''
                        set -eu

                        python3 - <<'PY'
import os
import re
from pathlib import Path

values_path = Path("opsdesk/values.yaml")
if not values_path.is_file():
    raise SystemExit(f"GitOps values file not found: {values_path}")

content = values_path.read_text()
image_tag = os.environ["IMAGE_TAG"]


def update_section_image_tag(text: str, section_name: str, image_tag: str) -> str:
    # Locate the requested top-level values section.
    section_pattern = re.compile(
        rf"(?m)^{re.escape(section_name)}:\\s*$"
    )
    section_match = section_pattern.search(text)
    if not section_match:
        raise RuntimeError(f"Top-level section not found: {section_name}")

    # Stop at the next top-level YAML key.
    next_section_match = re.search(
        r"(?m)^[A-Za-z_][A-Za-z0-9_-]*:\\s*$",
        text[section_match.end():]
    )
    section_end = (
        section_match.end() + next_section_match.start()
        if next_section_match
        else len(text)
    )

    section_block = text[section_match.start():section_end]

    # Locate the image subsection inside backend/frontend.
    image_match = re.search(r"(?m)^  image:\\s*$", section_block)
    if not image_match:
        raise RuntimeError(f"Image subsection not found in: {section_name}")

    # Stop at the next sibling key under the section (for example containerPort).
    next_sibling_match = re.search(
        r"(?m)^  [A-Za-z_][A-Za-z0-9_-]*:\\s*$",
        section_block[image_match.end():]
    )
    image_end = (
        image_match.end() + next_sibling_match.start()
        if next_sibling_match
        else len(section_block)
    )

    image_block = section_block[image_match.end():image_end]
    tag_pattern = re.compile(r"(?m)^(    tag:\\s*).*$")
    updated_image_block, replacements = tag_pattern.subn(
        lambda match: match.group(1) + '"' + image_tag + '"',
        image_block,
        count=1
    )

    if replacements != 1:
        raise RuntimeError(f"Exactly one image tag was not found in: {section_name}")

    updated_section = (
        section_block[:image_match.end()]
        + updated_image_block
        + section_block[image_end:]
    )

    return text[:section_match.start()] + updated_section + text[section_end:]


content = update_section_image_tag(content, "backend", image_tag)
content = update_section_image_tag(content, "frontend", image_tag)
values_path.write_text(content)

print(f"Backend image tag updated to: {image_tag}")
print(f"Frontend image tag updated to: {image_tag}")
PY

                        echo 'Reviewing GitOps values change:'
                        git diff -- opsdesk/values.yaml
                        git diff --check

                        git config user.name 'Jenkins CI'
                        git config user.email 'jenkins@users.noreply.github.com'
                        git add opsdesk/values.yaml

                        if git diff --cached --quiet; then
                            echo 'No GitOps changes detected; image tags are already current.'
                        else
                            git commit -m "Deploy OpsDesk images ${IMAGE_TAG}"
                        fi
                    '''

                    // Push the GitOps commit using the Jenkins-stored GitHub token.
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'github-opsdesk-gitops',
                            usernameVariable: 'GIT_USERNAME',
                            passwordVariable: 'GIT_TOKEN'
                        )
                    ]) {
                        sh '''
                            set +x
                            set -eu

                            # Create a temporary askpass helper; the token is never written to disk.
                            printf '%s\\n' \\
                              '#!/bin/sh' \\
                              'case "$1" in' \\
                              '  *Username*) printf "%s\\n" "$GIT_USERNAME" ;;' \\
                              '  *Password*) printf "%s\\n" "$GIT_TOKEN" ;;' \\
                              '  *) exit 1 ;;' \\
                              'esac' > .git-askpass.sh

                            chmod 700 .git-askpass.sh
                            trap 'rm -f .git-askpass.sh' EXIT

                            GIT_ASKPASS="$PWD/.git-askpass.sh" \\
                            GIT_TERMINAL_PROMPT=0 \\
                            git push origin HEAD:main
                        '''
                    }
                }
            }
        }
    }

    // Handle pipeline completion and report the actual result
    post {
        success {
            script {
                if (params.PUSH_IMAGES) {
                    echo "SUCCESS: OpsDesk images pushed and GitOps repository updated with tag ${IMAGE_TAG}."
                } else {
                    echo 'SUCCESS: CI completed. Docker Hub push and GitOps update were skipped.'
                }
            }
        }

        failure {
            echo 'FAILED: Pipeline stopped. Check the failed stage logs.'
        }

        always {
            echo 'OpsDesk CI/CD pipeline execution finished.'
        }
    }
}
