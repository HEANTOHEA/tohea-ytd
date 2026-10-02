# Cloud Deployment Guide — YouTube Music Downloader

This application requires **Node.js**, **FFmpeg**, and **yt-dlp**. To deploy it to the cloud smoothly without runtime dependency issues, containerization is used.

The repository includes:
- [Dockerfile](file:///d:/Buil%20Web/Youtube%20Music%20Download/Dockerfile) — Production multi-tool image with Node.js 20, FFmpeg, Python 3, and standalone yt-dlp.
- [docker-compose.yml](file:///d:/Buil%20Web/Youtube%20Music%20Download/docker-compose.yml) — 1-command startup for any Linux VPS / server.
- [cloudbuild.yaml](file:///d:/Buil%20Web/Youtube%20Music%20Download/cloudbuild.yaml) — Direct build & deploy pipeline for Google Cloud Run.
- [render.yaml](file:///d:/Buil%20Web/Youtube%20Music%20Download/render.yaml) & [fly.toml](file:///d:/Buil%20Web/Youtube%20Music%20Download/fly.toml) — 1-click PaaS configurations.

---

## ☁️ 1. Google Cloud Run (Recommended Cloud Container Platform)

Google Cloud Run scales containers from 0 to N and provides an automatic public HTTPS URL.

### Prerequisites
- [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install) installed, or use **Google Cloud Shell** in the browser.
- A GCP project with Billing enabled.

### Step-by-Step Deployment:

1. **Log in and set your project:**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Enable required services:**
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com
   ```

3. **Build and deploy in one command using Cloud Build:**
   ```bash
   gcloud run deploy yt-music-downloader \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 3000 \
     --memory 1Gi \
     --timeout 300
   ```
   > **Note:** `--memory 1Gi` ensures sufficient RAM for audio stream transcoding, and `--timeout 300` allows full-length songs and playlist processing.

4. Once finished, Cloud Run outputs the public URL:
   ```
   Service URL: https://yt-music-downloader-xxxxxxxx-uc.a.run.app
   ```

---

## 🖥️ 2. Custom Docker VPS (DigitalOcean / Linode / Hetzner / AWS EC2 / Ubuntu)

Deploying to your own Linux VPS gives you maximum speed, no cold starts, and full control.

### Step 1: Clone or copy the project files to your server
```bash
git clone <YOUR_GIT_REPO_URL> /opt/yt-music-downloader
cd /opt/yt-music-downloader
```

### Step 2: Start with Docker Compose
Ensure Docker and Docker Compose are installed on your VPS:
```bash
# Start in the background
docker compose up -d --build
```

Check logs:
```bash
docker compose logs -f
```

Your service will now be running on port `3000` (e.g. `http://YOUR_SERVER_IP:3000`).

### Step 3 (Optional): Nginx reverse proxy with free SSL (Certbot)
To expose it under a custom domain (e.g., `music.yourdomain.com`):

```nginx
# /etc/nginx/sites-available/ytmusic
server {
    server_name music.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```
Run `certbot --nginx -d music.yourdomain.com` for free HTTPS.

---

## 🟧 3. AWS (App Runner or Lightsail)

### Method A: AWS App Runner (Fastest serverless container on AWS)
1. Push your container image to **Amazon ECR** (Elastic Container Registry):
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   docker build -t yt-music-downloader .
   docker tag yt-music-downloader:latest <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yt-music-downloader:latest
   docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yt-music-downloader:latest
   ```
2. In AWS Console, open **App Runner** > **Create service**.
3. Select your ECR image, configure Port `3000`, 1 vCPU, 2 GB RAM.
4. Click **Create & Deploy**. AWS provides a public HTTPS domain.

### Method B: AWS Lightsail Containers (Low fixed cost ~$7/mo)
1. Open **Amazon Lightsail** > **Containers**.
2. Create a container service and push the Docker image with the Lightsail Control CLI (`aws lightsail push-container-image`).

---

## 🍪 Advanced Tip: YouTube Cloud Datacenter Cookies & Proxies

Some public cloud datacenters (GCP / AWS / DigitalOcean) have IP ranges that YouTube occasionally challenges with a bot check. 

The server has built-in support for cookies and proxies via environment variables:

1. **YouTube Cookies**:
   - Install the browser extension `Get cookies.txt LOCALLY`.
   - Export your cookies while logged into YouTube.
   - Set the environment variable:
     ```bash
     YT_COOKIES_CONTENT="<paste-full-cookies.txt-content-here>"
     ```
   - The application writes this to a secure temporary file and passes `--cookies` to `yt-dlp` automatically.

2. **HTTP/SOCKS5 Proxy (Optional)**:
   - If using a residential or rotating proxy:
     ```bash
     PROXY_URL="http://username:password@proxy.example.com:8080"
     ```
