using System;
using System.Collections.Generic;
using Microsoft.Azure.Functions.Worker;

namespace Sponsorkit.Tests.TestHelpers.Azure
{
    public class FunctionContextMock : FunctionContext
    {
        public override string InvocationId { get; }
        public override string FunctionId { get; }
        public override TraceContext TraceContext { get; }
        public override BindingContext BindingContext { get; }
        public override IServiceProvider InstanceServices { get; set; }
        public override FunctionDefinition FunctionDefinition { get; }
        public override IDictionary<object, object> Items { get; set; }
        public override IInvocationFeatures Features { get; }
    }
}