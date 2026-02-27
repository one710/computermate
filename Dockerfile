FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# 1) Install Xfce, x11vnc, Xvfb, xdotool, etc.
RUN apt-get update && apt-get install -y \
    curl \
    imagemagick \
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

# 2) Install Google Chrome (only support amd64)
RUN apt-get update && apt-get install -y \
    fonts-liberation gnupg libasound2 libgbm1 libgtk-3-0 libnss3 libu2f-udev libvulkan1 xdg-utils wget && \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y google-chrome-stable && \
    # Create a wrapper to handle --no-sandbox
    mv /usr/bin/google-chrome-stable /usr/bin/google-chrome-stable.real && \
    printf '#!/bin/bash\nexec /usr/bin/google-chrome-stable.real --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"\n' > /usr/bin/google-chrome-stable && \
    chmod +x /usr/bin/google-chrome-stable && \
    # Set as default browser
    update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/bin/google-chrome-stable 100 && \
    update-alternatives --set x-www-browser /usr/bin/google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# 3) Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && \
    rm -rf /var/lib/apt/lists/*

# 4) Copy supervisor config
COPY .docker/supervisor.conf /etc/supervisor/conf.d/computermate.conf

# 5) Create non-root sudoer
RUN useradd -ms /bin/bash one710 \
    && echo "one710 ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && mkdir -p /home/one710/.config/xfce4 \
    && echo 'WebBrowser=google-chrome' > /home/one710/.config/xfce4/helpers.rc \
    && chown -R one710:one710 /home/one710/.config
USER one710
WORKDIR /home/one710

# 6) Set x11vnc password as "one710"
RUN x11vnc -storepasswd one710 /home/one710/.vncpass

# 7) Copy project and build
COPY --chown=one710:one710 package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY --chown=one710:one710 src/ ./src/
COPY --chown=one710:one710 tsconfig.json ./
RUN yarn build

# 8) Expose VNC + MCP ports
EXPOSE 5900 3000

# 9) Healthcheck
HEALTHCHECK --interval=10s --timeout=3s \
    CMD x11vnc -display :99 -query version || exit 1

# 10) Start all services
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/computermate.conf"]
