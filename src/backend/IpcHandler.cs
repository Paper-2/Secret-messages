using System.Text.Json;

namespace Cryptography.Backend;

public class IpcHandler
{
    private readonly object _lock = new();

    public void SendEvent(object evt)
    {
        lock (_lock)
        {
            Console.WriteLine(JsonSerializer.Serialize(evt));
            Console.Out.Flush();
        }
    }

    public void SendResponse(string? id, bool success, object? data = null, string? error = null)
    {
        lock (_lock)
        {
            if (success)
                Console.WriteLine(JsonSerializer.Serialize(new { id, success, data }));
            else
                Console.WriteLine(JsonSerializer.Serialize(new { id, success, error }));
            Console.Out.Flush();
        }
    }

    public void SendReady(string version)
    {
        SendEvent(new { type = "ready", version });
    }

    public void SendError(string error)
    {
        SendEvent(new { type = "error", error });
    }
}
