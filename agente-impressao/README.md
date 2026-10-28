# Agente de impressão (por estação)

Serviço Node sem dependências, que escuta **somente** em `127.0.0.1:9101`. O sistema web (navegador) envia a ele
etiquetas/cupons; ele entrega à impressora. Sem o agente, tudo continua imprimindo pelo navegador.

## Instalar (Windows)
1. Instale o Node.js 18+ na estação.
2. Copie esta pasta, clique com o botão direito em `instalar-windows.bat` > Executar como administrador.
3. Abra http://127.0.0.1:9101 → cadastre os **destinos** (nome, tipo, linguagem) e, em *Origens permitidas*, o endereço do sistema web (já vem com `https://paes.x-star.com.br`; para acesso interno, ex.: `http://192.168.15.8:5072`). O Chrome pode pedir permissão para o site acessar dispositivos da rede local: permita.
4. No sistema: **Ferramentas > Configurar impressoras** e escolha o destino de cada documento.

## Destinos
| Tipo | Como chega | Linguagens |
|---|---|---|
| windows | fila instalada no Windows (inclui Brother pelo driver) | imagem-driver (padrão), escpos, zpl, tspl (bytes diretos na fila) |
| rede | TCP IP:9100 | escpos, zpl, tspl |
| serial | COMx (USB-serial) | escpos, zpl, tspl |

- **imagem-driver**: o sistema desenha a etiqueta (mesmo layout da tela) e o Windows imprime com o tamanho de papel exato.
- **escpos / zpl / tspl**: a etiqueta é convertida em imagem 1-bit e enviada em comandos nativos; o cupom da expedição sai como texto ESC/POS (cp1252, negrito, corte).
- TSPL: se a etiqueta sair em negativo, desmarque "inverter bits" no destino.

## Segurança
Só aceita `Host` 127.0.0.1/localhost, origens da lista, cabeçalho `X-Agente: paes`; a página de administração só altera com requisições do próprio endereço. Limite de 4 MB por trabalho.

## Teste
`node --test` (10 testes). Windows (PowerShell/winspool), serial e impressoras reais **não** foram testados em hardware: faça uma impressão de teste (botão *Teste*) em cada destino.

## Servidor em outra máquina (ex.: Linux) imprimindo no Windows

O navegador só alcança o agente no próprio `127.0.0.1`. Quando o servidor roda no Linux e as impressoras estão no Windows, o servidor repassa a impressão ao agente pela rede (rota `/api/impressao/*`); o front usa essa ponte sozinho quando não encontra o agente local.

1. No Windows das impressoras (como Administrador): `powershell -ExecutionPolicy Bypass -File liberar-rede.ps1`. Gera o token, coloca `"escuta": "0.0.0.0"` no `config.json`, libera a porta 9101 no firewall só para a rede local e reinicia o agente.
2. No servidor, em `server/.env`: `AGENTE_URL=http://IP-DO-WINDOWS:9101` e `AGENTE_TOKEN=<token mostrado>`; reinicie a API.
3. Cadastre as impressoras na página do agente **no Windows** (`http://127.0.0.1:9101`), como antes.

Segurança: com token o agente aceita de fora só `/status`, `/destinos`, `/imprimir` e `/testar`; a administração continua só no próprio Windows. Sem token (ou com menos de 16 caracteres) o agente escuta só em 127.0.0.1. Use rede confiável (o tráfego é HTTP puro).
