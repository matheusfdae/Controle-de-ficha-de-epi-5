# Trecho do /etc/caddy/Caddyfile na VM: no bloco do site, troque
#     reverse_proxy localhost:8080
# por este (o resto do bloco, como o /sb da API, fica igual):

	reverse_proxy localhost:8080 localhost:8081 {
		# Cada navegador fica preso a uma cópia (cookie): durante o deploy,
		# ninguém pega o index.html de uma versão e os arquivos da outra.
		lb_policy cookie
		# Se a cópia não responder, tenta a outra por até 5 s (o usuário não vê erro).
		lb_try_duration 5s
		# Testa as duas a cada 5 s; a que falhar sai da roda até voltar.
		health_uri /
		health_interval 5s
		health_timeout 2s
	}

# Depois de salvar:
#     sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
