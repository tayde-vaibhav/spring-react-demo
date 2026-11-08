import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.TreeMap;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Report checker only, outside Maven source roots; never loads fixture bytecode. */
public final class ReportVerifier {
    private static final String PREFIX = "org.example.qa.fixtures.JavaAnalyzerFixtures$";
    private record Rule(String pattern, String owner, String method, String field) {}
    private static final List<Rule> REQUIRED = List.of(
        new Rule("EI_EXPOSE_REP2", "AliasedList", "<init>", "values"),
        new Rule("PREDICTABLE_RANDOM", "PredictableCode", "securityCode", null),
        new Rule("CT_CONSTRUCTOR_THROW", "ThrowingConstructor", "<init>", null),
        new Rule("SPRING_ENDPOINT", "Endpoint", "endpoint", null),
        new Rule("SERVLET_HEADER", "RequestReads", "header", null),
        new Rule("SERVLET_PARAMETER", "RequestReads", "parameter", null),
        new Rule("COOKIE_USAGE", "RequestReads", "cookieValue", null),
        new Rule("THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION", "BroadThrows", "broad", null));
    private static final List<Rule> CONTROLS = List.of(
        new Rule("EI_EXPOSE_REP2", "CopiedList", null, null),
        new Rule("PREDICTABLE_RANDOM", "SecureCode", null, null),
        new Rule("CT_CONSTRUCTOR_THROW", "FinalThrowingConstructor", null, null),
        new Rule("SERVLET_HEADER", "LiteralValues", null, null),
        new Rule("SERVLET_PARAMETER", "LiteralValues", null, null),
        new Rule("COOKIE_USAGE", "LiteralValues", null, null),
        new Rule("THROWS_METHOD_THROWS_CLAUSE_BASIC_EXCEPTION", "NarrowThrows", null, null));

    public static void main(String[] args) {
        try {
            byte[] xml = System.in.readNBytes(8 * 1024 * 1024 + 1);
            require(xml.length <= 8 * 1024 * 1024);
            var factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            var builder = factory.newDocumentBuilder();
            builder.setEntityResolver((publicId, systemId) -> { throw new SAXException(); });
            builder.setErrorHandler(new DefaultHandler() {
                @Override public void error(SAXParseException error) throws SAXException { throw error; }
                @Override public void fatalError(SAXParseException error) throws SAXException { throw error; }
            });
            Element root = builder.parse(new ByteArrayInputStream(xml)).getDocumentElement();
            require(root.getTagName().equals("BugCollection"));
            Element errors = only(root, "Errors");
            require(number(errors, "errors") == 0 && number(errors, "missingClasses") == 0);
            require(root.getElementsByTagName("Error").getLength() == 0);
            require(root.getElementsByTagName("MissingClass").getLength() == 0);
            Element summary = only(root, "FindBugsSummary");
            var bugs = root.getElementsByTagName("BugInstance");
            require(number(summary, "total_bugs") == bugs.getLength());
            require(number(summary, "total_classes") > 0);
            var counts = new TreeMap<String, Integer>();
            for (int i = 0; i < bugs.getLength(); i++) {
                Element bug = (Element) bugs.item(i);
                require(bug.getParentNode() == root);
                String pattern = bug.getAttribute("type");
                require(pattern.matches("[A-Z][A-Z0-9_]{0,199}"));
                counts.merge(pattern, 1, Integer::sum);
            }
            int missing = 0;
            int controls = 0;
            for (Rule rule : REQUIRED) {
                boolean found = false;
                for (int i = 0; i < bugs.getLength(); i++) {
                    found |= matches((Element) bugs.item(i), rule);
                }
                if (!found) missing++;
            }
            for (Rule rule : CONTROLS) {
                // ClassStats confirms that an absent finding is not simply an absent control class.
                boolean analyzed = false;
                var classes = summary.getElementsByTagName("ClassStats");
                for (int i = 0; i < classes.getLength(); i++) {
                    analyzed |= ((Element) classes.item(i)).getAttribute("class").equals(PREFIX + rule.owner());
                }
                if (!analyzed) missing++;
                for (int i = 0; i < bugs.getLength(); i++) {
                    if (matches((Element) bugs.item(i), rule)) controls++;
                }
            }
            counts.forEach((pattern, count) -> System.out.println(pattern + "=" + count));
            System.out.println("findings=" + bugs.getLength() + " missing=" + missing + " controls=" + controls
                + " analysisErrors=0 missingClasses=0");
            if (missing != 0 || controls != 0) System.exit(1);
        } catch (Exception failure) {
            // Never echo XML, source, paths, or parser/exception messages.
            System.out.println("reportRejected=1");
            System.exit(1);
        }
    }

    private static boolean matches(Element bug, Rule rule) {
        return bug.getAttribute("type").equals(rule.pattern())
            && annotation(bug, "Class", "classname", PREFIX + rule.owner(), null)
            && (rule.method() == null || annotation(bug, "Method", "name", rule.method(), PREFIX + rule.owner()))
            && (rule.field() == null || annotation(bug, "Field", "name", rule.field(), PREFIX + rule.owner()));
    }

    private static boolean annotation(Element bug, String tag, String key, String value, String owner) {
        for (Node child = bug.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element && element.getTagName().equals(tag)
                && element.getAttribute(key).equals(value)
                && (owner == null || element.getAttribute("classname").equals(owner))) return true;
        }
        return false;
    }

    private static Element only(Element root, String name) {
        var elements = root.getElementsByTagName(name);
        require(elements.getLength() == 1 && elements.item(0).getParentNode() == root);
        return (Element) elements.item(0);
    }

    private static int number(Element element, String name) {
        String value = element.getAttribute(name);
        require(value.matches("[0-9]+"));
        return Integer.parseInt(value);
    }

    private static void require(boolean condition) {
        if (!condition) throw new IllegalArgumentException();
    }
}
