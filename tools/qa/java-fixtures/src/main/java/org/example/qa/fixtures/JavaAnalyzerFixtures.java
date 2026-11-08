package org.example.qa.fixtures;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.List;
import java.util.Random;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Compile and analyze only. Never instantiate, import into an app, or execute. */
public final class JavaAnalyzerFixtures {
    private JavaAnalyzerFixtures() {}

    public static final class AliasedList {
        private final List<String> values;

        public AliasedList(List<String> values) {
            this.values = values;
        }

        public int size() {
            return values.size();
        }
    }

    public static final class CopiedList {
        private final List<String> values;

        public CopiedList(List<String> values) {
            this.values = List.copyOf(values);
        }

        public int size() {
            return values.size();
        }
    }

    public static final class PredictableCode {
        public String securityCode() {
            return Integer.toString(new Random().nextInt(1_000_000));
        }
    }

    public static final class SecureCode {
        public String securityCode() {
            return Integer.toString(new SecureRandom().nextInt(1_000_000));
        }
    }

    public static class ThrowingConstructor {
        public ThrowingConstructor(boolean reject) {
            if (reject) {
                throw new IllegalArgumentException("fixture");
            }
        }
    }

    public static final class FinalThrowingConstructor {
        public FinalThrowingConstructor(boolean reject) {
            if (reject) {
                throw new IllegalArgumentException("fixture");
            }
        }
    }

    // Endpoint discovery is informational; no authentication/safe-endpoint control is claimed.
    @RestController
    public static final class Endpoint {
        @GetMapping("/qa-inert-fixture")
        public String endpoint() {
            return "fixture";
        }
    }

    public static final class RequestReads {
        public String header(HttpServletRequest request) {
            return request.getHeader("X-Fixture");
        }

        public String parameter(HttpServletRequest request) {
            return request.getParameter("fixture");
        }

        public Cookie[] cookies(HttpServletRequest request) {
            return request.getCookies();
        }

        // Installed CookieReadDetector flags Cookie getters, not getCookies().
        public String cookieValue(Cookie cookie) {
            return cookie.getValue();
        }
    }

    // Literal controls establish absence of request reads, not input validation or authorization.
    public static final class LiteralValues {
        public String header() {
            return "fixture";
        }

        public String parameter() {
            return "fixture";
        }

        public Cookie[] cookies() {
            return new Cookie[0];
        }
    }

    public static final class BroadThrows {
        public void broad(boolean reject) throws Exception {
            try {
                read(reject);
            } catch (IOException failure) {
                throw new Exception(failure);
            }
        }

        private void read(boolean reject) throws IOException {
            if (reject) {
                throw new IOException("fixture");
            }
        }
    }

    public static final class NarrowThrows {
        public void narrow(boolean reject) throws IOException {
            if (reject) {
                throw new IOException("fixture");
            }
        }
    }
}
