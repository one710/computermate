FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# 1) Install Xfce, x11vnc, Xvfb, xdotool, etc.
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    imagemagick \
    libpng-dev \
    libx11-dev \
    libxtst-dev \
    pulseaudio \
    software-properties-common \
    sudo \
    supervisor \
    unzip \
    x11-apps \
    x11vnc \
    xdotool \
    xfce4 \
    xfce4-goodies \
    xvfb \
    && apt-get remove -y light-locker xfce4-screensaver xfce4-power-manager || true \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2) Install Firefox ESR
RUN add-apt-repository ppa:mozillateam/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends firefox-esr \
    && update-alternatives --set x-www-browser /usr/bin/firefox-esr \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 3) Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && \
    rm -rf /var/lib/apt/lists/*

# 4) Copy supervisor config
COPY .docker/supervisor.conf /etc/supervisor/conf.d/computermate.conf

# 5) Create non-root sudoer
RUN useradd -ms /bin/bash one710 \
    && echo "one710 ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
USER one710
WORKDIR /home/one710

# 6) Set x11vnc password as "one710"
RUN x11vnc -storepasswd one710 /home/one710/.vncpass

# 7) Copy project and build
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./
RUN yarn build

# 8) Expose VNC + MCP ports
EXPOSE 5900 3000

# 9) Healthcheck
HEALTHCHECK --interval=10s --timeout=3s \
    CMD x11vnc -display :99 -query version || exit 1

# 10) Start all services
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/computermate.conf"]
