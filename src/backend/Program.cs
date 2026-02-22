using System.Text.Json;
using Cryptography.Backend;


// encoding
Console.OutputEncoding = System.Text.Encoding.UTF8;
Console.InputEncoding = System.Text.Encoding.UTF8;

var ipc = new IpcHandler();
var p2p = new P2pManager(ipc);

ipc.SendReady("0.0.1");

while (!p2p.CancellationToken.IsCancellationRequested)
{
    try
    {
        var line = Console.ReadLine();
        if (line == null) break;

        var request = JsonSerializer.Deserialize<JsonElement>(line);
        var command = request.GetProperty("command").GetString();
        var id = request.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;

        try
        {
            object? result = command switch
            {
                // P2P commands
                "p2pListen" => p2p.Listen(request),
                "p2pConnect" => await p2p.ConnectAsync(request),
                "p2pSend" => p2p.Send(request),
                "p2pBroadcast" => p2p.Broadcast(request),
                "p2pDisconnect" => p2p.Disconnect(request),
                "p2pPeers" => p2p.GetPeers(),
                "p2pInfo" => p2p.GetInfo(),
                "p2pScan" => await p2p.ScanAsync(request),

                "ping" => new { pong = true },
                "exit" => null,
                _ => throw new NotSupportedException($"Unknown command: {command}")
            };

            if (command == "exit")
            {
                p2p.Cancel();
                break;
            }

            ipc.SendResponse(id, true, result);
        }
        catch (Exception ex)
        {
            ipc.SendResponse(id, false, error: ex.Message);
        }
    }
    catch (Exception ex)
    {
        ipc.SendError(ex.Message);
    }
}

p2p.Shutdown();
