package com.vaibhav.springreactdemo.api;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.Appender;
import ch.qos.logback.core.OutputStreamAppender;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Isolated;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

@Isolated("Captures this logger in memory; does not write test request data to normal appenders")
class LogSanitizerTest {

    private final Logger logger = (Logger) LoggerFactory.getLogger(ApiExceptionHandler.class);
    private final ByteArrayOutputStream output = new ByteArrayOutputStream();
    private final List<Appender<ILoggingEvent>> previousAppenders = new ArrayList<>();
    private final ListAppender<ILoggingEvent> events = new ListAppender<>();
    private final OutputStreamAppender<ILoggingEvent> rendered = new OutputStreamAppender<>();
    private final PatternLayoutEncoder encoder = new PatternLayoutEncoder();
    private Level previousLevel;
    private boolean previousAdditive;

    @BeforeEach
    void captureOnlyInMemory() {
        previousLevel = logger.getLevel();
        previousAdditive = logger.isAdditive();
        logger.iteratorForAppenders().forEachRemaining(previousAppenders::add);
        previousAppenders.forEach(logger::detachAppender);
        logger.setAdditive(false);
        logger.setLevel(Level.ERROR);
        encoder.setContext(logger.getLoggerContext());
        encoder.setPattern("%msg%n");
        encoder.start();
        rendered.setContext(logger.getLoggerContext());
        rendered.setEncoder(encoder);
        rendered.setOutputStream(output);
        rendered.start();
        events.setContext(logger.getLoggerContext());
        events.start();
        logger.addAppender(rendered);
        logger.addAppender(events);
    }

    @AfterEach
    void restoreLogger() {
        logger.detachAppender(rendered);
        logger.detachAppender(events);
        rendered.stop();
        events.stop();
        encoder.stop();
        previousAppenders.forEach(logger::addAppender);
        logger.setLevel(previousLevel);
        logger.setAdditive(previousAdditive);
    }

    @Test
    void replacesCrLfAndOtherControlsAndBoundsOneRenderedLogLine() {
        String input = "/qa/\r\n\t\u0000\u0085\u2028\u2029\u202e" + "x".repeat(10_000);
        String sanitized = LogSanitizer.singleLine(input);
        logger.error("{}", sanitized);
        assertEquals(LogSanitizer.MAX_VALUE_LENGTH, sanitized.length());
        assertTrue(sanitized.startsWith("/qa/________"));
        assertTrue(sanitized.endsWith("..."));
        assertFalse(sanitized.codePoints().anyMatch(LogSanitizerTest::unsafe));
        assertEquals(1, events.list.size());
        assertEquals(sanitized + System.lineSeparator(), output.toString(StandardCharsets.UTF_8));
        assertEquals(1, output.toString(StandardCharsets.UTF_8).lines().count());
    }

    @Test
    void replacesEveryIsoControlWithoutChangingOrdinaryCharacters() {
        for (int codePoint = 0; codePoint <= 159; codePoint++) {
            if (Character.isISOControl(codePoint)) {
                assertEquals("a_b", LogSanitizer.singleLine("a" + (char) codePoint + "b"));
            }
        }
        String ordinary = "/api/v1/products/qa-café-🌿%0D%0A";
        assertEquals(ordinary, LogSanitizer.singleLine(ordinary));
        assertEquals("", LogSanitizer.singleLine(""));
        assertEquals("null", LogSanitizer.singleLine(null));
        assertEquals("a_b", LogSanitizer.singleLine("a\ud800b"));
    }

    @Test
    void respectsExactBoundaryAndDoesNotSplitSupplementaryCharacters() {
        String boundary = "x".repeat(LogSanitizer.MAX_VALUE_LENGTH);
        assertEquals(boundary, LogSanitizer.singleLine(boundary));
        assertEquals("x".repeat(509) + "...", LogSanitizer.singleLine(boundary + "x"));
        String emoji = "🌿".repeat(300);
        String sanitized = LogSanitizer.singleLine(emoji);
        assertTrue(sanitized.length() <= LogSanitizer.MAX_VALUE_LENGTH);
        assertTrue(sanitized.endsWith("..."));
        assertFalse(sanitized.codePoints().anyMatch(cp -> Character.getType(cp) == Character.SURROGATE));
    }

    @Test
    void unexpectedHandlerLogsOnlyExistingPathAndTypeWithoutSensitiveSourcesOrThrowable() {
        // Opaque synthetic markers stay in memory; no real credentials or JWT/cookie values are used.
        String marker = UUID.randomUUID().toString();
        var request = new MockHttpServletRequest("GET", "/qa/" + "x".repeat(10_000));
        request.setQueryString("private=" + marker);
        request.addHeader(HttpHeaders.AUTHORIZATION, marker);
        request.addHeader("X-QA-Private", marker);
        request.setCookies(new Cookie("qa-private", marker));
        request.setContent(marker.getBytes(StandardCharsets.UTF_8));
        var cause = new IllegalArgumentException(marker + "\r\nprivate-cause");
        var exception = new IllegalStateException(marker + "\r\nprivate-message", cause);
        exception.addSuppressed(new RuntimeException(marker));
        Locale previous = Locale.getDefault();
        Locale previousDisplay = Locale.getDefault(Locale.Category.DISPLAY);
        Locale previousFormat = Locale.getDefault(Locale.Category.FORMAT);
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            var problem = new ApiExceptionHandler().handleUnexpected(exception, request);
            assertEquals(500, problem.getStatus());
            assertEquals("urn:problem:internal-server-error", problem.getType().toString());
            assertEquals("Internal server error", problem.getTitle());
            assertEquals("An unexpected error occurred.", problem.getDetail());
            assertEquals(request.getRequestURI(), problem.getInstance().toString());
            assertNull(problem.getProperties());
        } finally {
            Locale.setDefault(previous);
            Locale.setDefault(Locale.Category.DISPLAY, previousDisplay);
            Locale.setDefault(Locale.Category.FORMAT, previousFormat);
        }
        assertEquals(1, events.list.size());
        var event = events.list.getFirst();
        assertNull(event.getThrowableProxy());
        assertEquals(2, event.getArgumentArray().length);
        assertEquals(LogSanitizer.singleLine(request.getRequestURI()), event.getArgumentArray()[0]);
        assertEquals(IllegalStateException.class.getName(), event.getArgumentArray()[1]);
        String text = output.toString(StandardCharsets.UTF_8);
        assertFalse(text.contains(marker));
        assertFalse(text.contains("private-message"));
        assertFalse(text.contains("private-cause"));
        assertEquals(1, text.lines().count());
        assertTrue(text.length() < 700);
    }

    @Test
    void handledClientErrorsDoNotIntroduceLogging() {
        var handler = new ApiExceptionHandler();
        var request = new MockHttpServletRequest("GET", "/qa/client-error");
        handler.handleBadRequest(new IllegalArgumentException("test-only"), request);
        handler.handleUnauthorized(new com.vaibhav.springreactdemo.security.InvalidCredentialsException(), request);
        handler.handleForbidden(new org.springframework.security.access.AccessDeniedException("test-only"), request);
        handler.handleRateLimit(new com.vaibhav.springreactdemo.security.LoginRateLimitException(), request);
        assertTrue(events.list.isEmpty());
        assertEquals(0, output.size());
    }

    private static boolean unsafe(int codePoint) {
        int type = Character.getType(codePoint);
        return Character.isISOControl(codePoint) || type == Character.FORMAT
                || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR;
    }
}
