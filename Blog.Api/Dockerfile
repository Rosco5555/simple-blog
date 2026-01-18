FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src
COPY ["Blog.Api.csproj", "./"]
RUN dotnet restore --runtime linux-musl-x64
COPY . .
RUN dotnet publish -c Release -o /app/publish --runtime linux-musl-x64 --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "Blog.Api.dll"]
