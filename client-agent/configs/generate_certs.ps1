Param()
Write-Output "Generating demo CA + server + client certificates (OpenSSL required)"
$cwd = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $cwd

& openssl genrsa -out ca-key.pem 4096
& openssl req -x509 -new -nodes -key ca-key.pem -sha256 -days 3650 -subj "/CN=helpdesk-ca" -out ca.pem

& openssl genrsa -out server-key.pem 2048
& openssl req -new -key server-key.pem -subj "/CN=localhost" -out server.csr
& openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server.pem -days 365 -sha256

& openssl genrsa -out client-key.pem 2048
& openssl req -new -key client-key.pem -subj "/CN=playbook-client" -out client.csr
& openssl x509 -req -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out client.pem -days 365 -sha256

Write-Output "Generated certs: ca.pem, server.pem, server-key.pem, client.pem, client-key.pem"
