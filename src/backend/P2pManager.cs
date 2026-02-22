using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Cryptography.Backend;

public class P2pManager
{
    private readonly IpcHandler _ipc;
    private readonly Dictionary<string, TcpClient> _peers = new();
    private readonly Dictionary<string, StreamWriter> _peerWriters = new();
    private TcpListener? _listener;
    private int? _localPort;
    private CancellationTokenSource _cts = new();

    public P2pManager(IpcHandler ipc)
    {
        _ipc = ipc;
    }

    public CancellationToken CancellationToken => _cts.Token;

    public void Cancel() => _cts.Cancel();

    public void Shutdown()
    {
        _listener?.Stop();
        foreach (var client in _peers.Values)
            client.Close();
    }

    private async Task ReadFromPeerAsync(string peerId, TcpClient client)
    {
        try
        {
            using var reader = new StreamReader(client.GetStream(), Encoding.UTF8);
            while (!_cts.Token.IsCancellationRequested && client.Connected)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                _ipc.SendEvent(new { type = "p2p:message", peerId, payload = line });
            }
        }
        catch { }
        finally
        {
            _peers.Remove(peerId);
            _peerWriters.Remove(peerId);
            client.Close();
            _ipc.SendEvent(new { type = "p2p:peer-disconnected", peerId });
        }
    }

    public object Listen(JsonElement request)
    {
        var port = request.TryGetProperty("port", out var portProp) ? portProp.GetInt32() : 9000;

        if (_listener != null)
        {
            _listener.Stop();
            _listener = null;
        }

        _listener = new TcpListener(IPAddress.Any, port);
        _listener.Start();
        _localPort = port;

        _ = Task.Run(async () =>
        {
            while (!_cts.Token.IsCancellationRequested)
            {
                try
                {
                    var client = await _listener.AcceptTcpClientAsync(_cts.Token);
                    var endpoint = (IPEndPoint)client.Client.RemoteEndPoint!;
                    var peerId = $"{endpoint.Address}:{endpoint.Port}";

                    _peers[peerId] = client;
                    _peerWriters[peerId] = new StreamWriter(client.GetStream(), Encoding.UTF8) { AutoFlush = true };

                    _ipc.SendEvent(new { type = "p2p:peer-connected", peerId });
                    _ = Task.Run(() => ReadFromPeerAsync(peerId, client));
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex) { _ipc.SendEvent(new { type = "p2p:error", error = ex.Message }); }
            }
        });

        return new { success = true, port };
    }

    public async Task<object> ConnectAsync(JsonElement request)
    {
        var host = request.GetProperty("host").GetString()!;
        var port = request.TryGetProperty("port", out var portProp) ? portProp.GetInt32() : 9000;
        var peerId = $"{host}:{port}";

        if (_peers.ContainsKey(peerId))
            return new { success = true, peerId, alreadyConnected = true };

        var client = new TcpClient();
        await client.ConnectAsync(host, port);

        _peers[peerId] = client;
        _peerWriters[peerId] = new StreamWriter(client.GetStream(), Encoding.UTF8) { AutoFlush = true };

        _ipc.SendEvent(new { type = "p2p:peer-connected", peerId });
        _ = Task.Run(() => ReadFromPeerAsync(peerId, client));

        return new { success = true, peerId };
    }

    public object Send(JsonElement request)
    {
        var peerId = request.GetProperty("peerId").GetString()!;
        var message = request.GetProperty("message").GetRawText();

        if (!_peerWriters.TryGetValue(peerId, out var writer))
            throw new InvalidOperationException($"Peer {peerId} not found");

        writer.WriteLine(message);
        return new { success = true };
    }

    public object Broadcast(JsonElement request)
    {
        var message = request.GetProperty("message").GetRawText();
        int sent = 0;

        foreach (var (peerId, writer) in _peerWriters)
        {
            try { writer.WriteLine(message); sent++; }
            catch (Exception ex) { _ipc.SendEvent(new { type = "p2p:error", peerId, error = ex.Message }); }
        }

        return new { sent };
    }

    public object Disconnect(JsonElement request)
    {
        var peerId = request.TryGetProperty("peerId", out var peerIdProp) ? peerIdProp.GetString() : null;

        if (peerId != null)
        {
            if (_peers.TryGetValue(peerId, out var client))
            {
                client.Close();
                _peers.Remove(peerId);
                _peerWriters.Remove(peerId);
            }
        }
        else
        {
            foreach (var client in _peers.Values) client.Close();
            _peers.Clear();
            _peerWriters.Clear();
            if (_listener != null) { _listener.Stop(); _listener = null; _localPort = null; }
        }

        return new { success = true };
    }

    public object GetPeers() => new { peers = _peers.Keys.ToArray() };

    public object GetInfo()
    {
        var addresses = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address))
            .Select(a => new { address = a.Address.ToString() })
            .ToArray();

        return new { addresses, hosting = _listener != null, port = _localPort, peerCount = _peers.Count };
    }

    public async Task<object> ScanAsync(JsonElement request)
    {
        var port = request.TryGetProperty("port", out var portProp) ? portProp.GetInt32() : 9000;
        var timeout = request.TryGetProperty("timeout", out var timeoutProp) ? timeoutProp.GetInt32() : 500;

        var localAddresses = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address))
            .Select(a => a.Address.ToString())
            .ToList();

        var foundPeers = new List<string>();
        var tasks = new List<Task>();

        foreach (var localAddr in localAddresses)
        {
            var parts = localAddr.Split('.');
            var subnet = $"{parts[0]}.{parts[1]}.{parts[2]}";

            for (int i = 1; i <= 254; i++)
            {
                var targetIp = $"{subnet}.{i}";
                if (localAddresses.Contains(targetIp) || _peers.ContainsKey($"{targetIp}:{port}")) continue;

                tasks.Add(Task.Run(async () =>
                {
                    try
                    {
                        using var client = new TcpClient();
                        using var scanCts = new CancellationTokenSource(timeout);
                        await client.ConnectAsync(targetIp, port, scanCts.Token);
                        lock (foundPeers) foundPeers.Add(targetIp);
                    }
                    catch { }
                }));
            }
        }

        var batchSize = 50;
        for (int i = 0; i < tasks.Count; i += batchSize)
            await Task.WhenAll(tasks.Skip(i).Take(batchSize));

        return new { peers = foundPeers.Distinct().ToArray() };
    }
}
