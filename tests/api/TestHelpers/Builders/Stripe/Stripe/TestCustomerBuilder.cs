using System.Threading.Tasks;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe
{
    public class TestCustomerBuilder
    {
        private readonly CustomerService customerService;

        private TestPaymentMethodBuilder paymentMethodBuilder;

        public TestCustomerBuilder(
            CustomerService customerService)
        {
            this.customerService = customerService;
        }

        public TestCustomerBuilder WithDefaultPaymentMethod(TestPaymentMethodBuilder paymentMethodBuilder)
        {
            this.paymentMethodBuilder = paymentMethodBuilder;
            return this;
        }

        public async Task<Customer> BuildAsync()
        {
            var customer = await this.customerService.CreateAsync(new CustomerCreateOptions());

            var paymentMethod = this.paymentMethodBuilder != null ? 
                await this.paymentMethodBuilder
                    .WithCustomer(customer)
                    .BuildAsync() :
                null;

            if (paymentMethod != null)
            {
                await this.customerService.UpdateAsync(
                    customer.Id,
                    new CustomerUpdateOptions()
                    {
                        InvoiceSettings = new CustomerInvoiceSettingsOptions()
                        {
                            DefaultPaymentMethod = paymentMethod.Id
                        }
                    });
            }

            return customer;
        }
    }

}
