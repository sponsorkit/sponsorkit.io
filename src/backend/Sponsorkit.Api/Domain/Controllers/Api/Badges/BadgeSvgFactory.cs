using System;
using System.Globalization;
using System.Net;

namespace Sponsorkit.Api.Domain.Controllers.Api.Badges;

public static class BadgeSvgFactory
{
    public static string Render(string label, string message, string color = "#2ea44f")
{
          var labelWidth = Measure(label);
        var messageWidth = Measure(message);
        var totalWidth = labelWidth + messageWidth;
        var messageStart = labelWidth;
        var labelTextPosition = labelWidth / 2;
        var messageTextPosition = labelWidth + (messageWidth / 2);

        return
                      "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + totalWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"20\" role=\"img\" aria-label=\"" + Encode(label + ": " + message) + "\">" +
                      "<linearGradient id=\"s\" x2=\"0\" y2=\"100%\"><stop offset=\"0\" stop-color=\"#bbb\" stop-opacity=\".1\"/><stop offset=\"1\" stop-opacity=\".1\"/></linearGradient>" +
                      "<clipPath id=\"r\"><rect width=\"" + totalWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"20\" rx=\"3\" fill=\"#fff\"/></clipPath>" +
                      "<g clip-path=\"url(#r)\">" +
                      "<rect width=\"" + labelWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"20\" fill=\"#555\"/>" +
                      "<rect x=\"" + messageStart.ToString(CultureInfo.InvariantCulture) + "\" width=\"" + messageWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"20\" fill=\"" + Encode(color) + "\"/>" +
                      "<rect width=\"" + totalWidth.ToString(CultureInfo.InvariantCulture) + "\" height=\"20\" fill=\"url(#s)\"/>" +
                      "</g>" +
                      "<g fill=\"#fff\" text-anchor=\"middle\" font-family=\"Verdana,Geneva,DejaVu Sans,sans-serif\" font-size=\"11\">" +
                      "<text x=\"" + labelTextPosition.ToString(CultureInfo.InvariantCulture) + "\" y=\"15\" fill=\"#010101\" fill-opacity=\".3\">" + Encode(label) + "</text>" +
                      "<text x=\"" + labelTextPosition.ToString(CultureInfo.InvariantCulture) + "\" y=\"14\">" + Encode(label) + "</text>" +
                      "<text x=\"" + messageTextPosition.ToString(CultureInfo.InvariantCulture) + "\" y=\"15\" fill=\"#010101\" fill-opacity=\".3\">" + Encode(message) + "</text>" +
                      "<text x=\"" + messageTextPosition.ToString(CultureInfo.InvariantCulture) + "\" y=\"14\">" + Encode(message) + "</text>" +
                      "</g>" +
                      "</svg>";
}

    public static string FormatDollarAmount(long amountInHundreds)
{
          var amount = amountInHundreds / 100M;
        return amount % 1 == 0
                      ? "$" + amount.ToString("0", CultureInfo.InvariantCulture)
                      : "$" + amount.ToString("0.##", CultureInfo.InvariantCulture);
}

    private static int Measure(string value)
{
          return Math.Max(36, (value.Length * 7) + 10);
}

    private static string Encode(string value)
{
          return WebUtility.HtmlEncode(value);
}
}
