using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;

namespace Sponsorkit.Infrastructure.Security.Encryption
{

    public class AesEncryptionHelper : IAesEncryptionHelper
    {
        private readonly IOptionsMonitor<EncryptionOptions> encryptionOptionsMonitor;

        public AesEncryptionHelper(
            IOptionsMonitor<EncryptionOptions> encryptionOptionsMonitor)
        {
            this.encryptionOptionsMonitor = encryptionOptionsMonitor;
        }

        private static byte[] GenerateRandomInitializationVector(string key)
        {
            var aes = GetAesAlgorithm(key);
            aes.GenerateIV();

            return aes.IV;
        }

        private static Aes GetAesAlgorithm(string key)
        {
            var aes = Aes.Create();
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.KeySize = 256;
            aes.BlockSize = 128;
            aes.Key = GetKeyBytesFromString(key);

            return aes;
        }

        private static byte[] GetKeyBytesFromString(string key)
        {
            return Encoding.UTF8.GetBytes(key);
        }

        public async Task<byte[]> EncryptAsync(string plainText)
        {
            var key = encryptionOptionsMonitor.CurrentValue.Pepper;
            if (key == null)
                throw new InvalidOperationException("Could not find a pepper in the configuration of the application.");

            using var aes = GetAesAlgorithm(key);
            aes.IV = GenerateRandomInitializationVector(key);

            using var encryptor = aes.CreateEncryptor(
                aes.Key,
                aes.IV);

            await using var memoryStream = new MemoryStream();
            await memoryStream.WriteAsync(aes.IV);

            await using var cryptoStream = new CryptoStream(memoryStream, encryptor, CryptoStreamMode.Write);
            await using (var streamWriter = new StreamWriter(cryptoStream))
            {
                await streamWriter.WriteAsync(plainText);
            }

            var encrypted = memoryStream.ToArray();
            return encrypted;
        }

        public async Task<string> DecryptAsync(byte[] cipherText)
        {
            var key = encryptionOptionsMonitor.CurrentValue.Pepper;
            if (key == null)
                throw new InvalidOperationException("Could not find a pepper in the configuration of the application.");

            var dataBytes = ExtractDataBytesFromCipherText(cipherText);

            using var aes = GetAesAlgorithm(key);
            aes.IV = ExtractInitializationVectorFromCipherText(cipherText);

            using var decryptor = aes.CreateDecryptor(
                aes.Key,
                aes.IV);

            await using var memoryStream = new MemoryStream(dataBytes);
            await using var cryptoStream = new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Read);
            using var streamReader = new StreamReader(cryptoStream);
            var text = await streamReader.ReadToEndAsync();

            return text;
        }

        private static byte[] ExtractDataBytesFromCipherText(byte[] cipherText)
        {
            var data = new byte[cipherText.Length - 16];
            Array.Copy(cipherText, 16, data, 0, data.Length);
            return data;
        }

        private static byte[] ExtractInitializationVectorFromCipherText(byte[] cipherText)
        {
            var initializationVector = new byte[16];
            Array.Copy(cipherText, 0, initializationVector, 0, initializationVector.Length);
            return initializationVector;
        }
    }
}
