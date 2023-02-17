namespace Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;

public interface IEncryptionHelper
{
    Task<byte[]> EncryptAsync(string plainText);
    Task<string> DecryptAsync(byte[] cipherText);
}