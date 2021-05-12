using System.Threading.Tasks;

namespace Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost.Encryption
{
    public interface IAesEncryptionHelper
    {
        Task<byte[]> EncryptAsync(string plainText);
        Task<string> DecryptAsync(byte[] cipherText);
    }
}
