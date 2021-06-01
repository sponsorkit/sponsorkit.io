using System.Threading.Tasks;

namespace Sponsorkit.Domain.Api.Signup.FromGitHub.Encryption
{
    public interface IAesEncryptionHelper
    {
        Task<byte[]> EncryptAsync(string plainText);
        Task<string> DecryptAsync(byte[] cipherText);
    }
}
