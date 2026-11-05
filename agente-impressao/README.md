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

## Outros computadores imprimindo por este agente (conexão de dentro para fora)

O navegador só alcança o agente no próprio `127.0.0.1`. Para os **outros computadores** imprimirem nas impressoras deste, o agente **conecta ao sistema** (long-poll em `/api/agente-tunel/proximo`), recebe os pedidos (`/status`, `/destinos`, `/imprimir`, `/testar`), executa no próprio 127.0.0.1 e devolve o resultado. Como só o agente abre conexão, funciona com o sistema na mesma rede, em outra rede ou na internet — **sem IP fixo, porta liberada, firewall ou VPN**.

1. No sistema, em Ferramentas › Configurar impressoras, baixe **"Instalador do computador das impressoras"** e execute-o nesse computador. Ele já grava o endereço do sistema e o token de pareamento.
2. Cadastre as impressoras na página do agente (`http://127.0.0.1:9101`), como antes.
3. Pronto: os demais computadores escolhem o destino de cada documento em Configurar impressoras.

Computador que imprime só para si (impressora ligada nele): use **"Instalador só para este computador"**; ele não conecta ao sistema.

Conectar à mão: na página do agente, em "Conexão com o sistema", informe o endereço do sistema e o token (que o administrador vê em Configurar impressoras). Use **um** agente conectado por sistema. Segurança: o agente só escuta em 127.0.0.1 e nunca abre porta para a rede; o túnel só aceita as 4 rotas acima e exige o token.
