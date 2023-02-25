FROM ubuntu

RUN apt-get update

RUN apt-get install -y ca-certificates
RUN apt-get install -y curl
RUN apt-get install -y software-properties-common
RUN apt-get install -y lsof

# install Node
RUN apt-get install -y npm
RUN npm install n -g
RUN n lts

# install TypeScript
RUN npm install -g typescript

# install PlayWright
RUN npx playwright install-deps
RUN npx playwright install

# install dotnet
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y libc6
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y libgcc1
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y libgssapi-krb5-2
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y libstdc++6
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y zlib1g
RUN curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin -Channel 6.0 -InstallDir /usr/share/dotnet
RUN ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet
RUN dotnet --version

# install Docker in Docker
RUN curl -fsSL https://get.docker.com | sh

CMD ["sleep", "infinity"]