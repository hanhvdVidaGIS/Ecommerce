# Backend API (.NET 9). Build context: thư mục backend/
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
# Khôi phục gói trước để tận dụng lớp đệm khi chỉ sửa mã nguồn
COPY Ccp.sln ./
COPY src/Ccp.Domain/Ccp.Domain.csproj src/Ccp.Domain/
COPY src/Ccp.Application/Ccp.Application.csproj src/Ccp.Application/
COPY src/Ccp.Infrastructure/Ccp.Infrastructure.csproj src/Ccp.Infrastructure/
COPY src/Ccp.Api/Ccp.Api.csproj src/Ccp.Api/
RUN dotnet restore src/Ccp.Api/Ccp.Api.csproj
COPY src/ src/
RUN dotnet publish src/Ccp.Api/Ccp.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
# Thư mục tệp tải lên: gắn volume vào đây. Chạy bằng người dùng không có quyền root.
RUN mkdir -p /data/uploads && chown -R app:app /data
USER app
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    Storage__LocalPath=/data/uploads
EXPOSE 8080
ENTRYPOINT ["dotnet", "Ccp.Api.dll"]
