package com.vaibhav.springreactdemo.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.autoproxy.DefaultAdvisorAutoProxyCreator;
import org.springframework.aop.config.AopConfigUtils;
import org.springframework.aop.support.AopUtils;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.MapPropertySource;
import org.springframework.data.web.config.EnableSpringDataWebSupport;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageConverters;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.http.converter.json.ProblemDetailJacksonMixin;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.vaibhav.springreactdemo.AppTestController;
import com.vaibhav.springreactdemo.api.ApiExceptionHandler;
import com.vaibhav.springreactdemo.product.ProductController;
import com.vaibhav.springreactdemo.product.ProductService;
import com.vaibhav.springreactdemo.product.dto.*;
import tools.jackson.databind.json.JsonMapper;

/** Real MVC/security/JWT beans; no Boot auto-configuration, YAML, socket or Mongo client. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SecurityAccessMatrixTest {

    private static final String PRODUCT_JSON = """
            {"name":"qa-matrix","category":"QA","price":12.50,"stock":1,
             "description":"QA fixture","tags":["qa"],"specs":{},"active":true}
            """;
    private static final JsonMapper JSON = JsonMapper.builder()
            .addMixIn(ProblemDetail.class, ProblemDetailJacksonMixin.class).build();
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;
    private ProductService products;

    @BeforeAll
    void openIsolatedSecurityContext() {
        context = newContext("test");
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        products = context.getBean(ProductService.class);
    }

    @AfterAll
    void closeContext() {
        if (context != null) context.close();
    }

    @BeforeEach
    void mockPersistenceBoundary() {
        reset(products);
        when(products.search(any(), any(), any(), any(), any()))
                .thenReturn(new ProductPageResponse(List.of(product()), 0, 20, 1, 1, true, true));
        when(products.getById("qa-id")).thenReturn(product());
        when(products.create(any())).thenReturn(product());
        when(products.update(eq("qa-id"), any())).thenReturn(product());
        when(products.getStats()).thenReturn(List.of(new ProductCategoryStatsResponse("QA", 1, BigDecimal.TEN)));
    }

    private record Route(String method, String path, String policy, int allowedStatus) {}

    static Stream<Arguments> accessMatrix() {
        var routes = List.of(
                new Route("GET", "/api/v1/products", "read", 200),
                new Route("GET", "/api/v1/products/qa-id", "read", 200),
                new Route("GET", "/api/v1/products/stats", "authenticated", 200),
                new Route("POST", "/api/v1/products", "admin", 201),
                new Route("PUT", "/api/v1/products/qa-id", "admin", 200),
                new Route("DELETE", "/api/v1/products/qa-id", "admin", 204),
                new Route("GET", "/api/v1/auth/me", "authenticated", 200),
                new Route("POST", "/api/v1/auth/logout", "authenticated", 204),
                new Route("GET", "/api/v1/auth/csrf", "public", 200),
                new Route("POST", "/api/v1/auth/login", "public", 400), // invalid DTO, no credentials
                new Route("GET", "/api/v1/qa-unknown", "deny", 403),
                new Route("GET", "/app-test", "deny", 403),
                new Route("GET", "/actuator/env", "deny", 403),
                new Route("GET", "/swagger-ui.html", "deny", 403),
                new Route("GET", "/swagger-ui/index.html", "deny", 403),
                new Route("GET", "/v3/api-docs", "deny", 403));
        return routes.stream().flatMap(route -> Stream.of("ANONYMOUS", "USER", "ADMIN", "ROLELESS")
                .map(identity -> {
                    boolean allowed = route.policy().equals("public")
                            || (route.policy().equals("authenticated") && !identity.equals("ANONYMOUS"))
                            || (route.policy().equals("read") && (identity.equals("USER") || identity.equals("ADMIN")))
                            || (route.policy().equals("admin") && identity.equals("ADMIN"));
                    int expected = allowed ? route.allowedStatus() : identity.equals("ANONYMOUS") ? 401 : 403;
                    return Arguments.of(route.method(), route.path(), identity, expected);
                }));
    }

    @ParameterizedTest(name = "{0} {1} as {2} -> {3}")
    @MethodSource("accessMatrix")
    void realRequestChainEnforcesTheAccessMatrix(String method, String path, String identity, int expected)
            throws Exception {
        var request = request(HttpMethod.valueOf(method), path);
        addIdentity(request, identity);
        if (!method.equals("GET")) addCsrf(request);
        if (method.equals("POST") || method.equals("PUT")) {
            String body = path.endsWith("/login") ? "{}" : PRODUCT_JSON;
            if (method.equals("PUT")) body = body.replace("\"active\":true", "\"active\":true,\"version\":0");
            request.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        var result = mvc.perform(request).andExpect(status().is(expected));
        if (expected == 401 || expected == 403) {
            result.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(expected))
                    .andExpect(jsonPath("$.type").value(expected == 401
                            ? "urn:problem:authentication-required" : "urn:problem:access-denied"));
            verifyNoInteractions(products);
        }
    }

    @Test
    void finalComponentsRemainInjectedAndUnproxiedWithAdvisorAutoProxyingEnabled() {
        var auth = context.getBean(AuthService.class);
        var limiter = context.getBean(LoginRateLimiter.class);
        assertEquals(AuthService.class, auth.getClass());
        assertEquals(LoginRateLimiter.class, limiter.getClass());
        assertFalse(AopUtils.isAopProxy(auth));
        assertFalse(AopUtils.isAopProxy(limiter));
        assertSame(limiter, ReflectionTestUtils.getField(auth, "rateLimiter"));
        assertTrue(context.getBeansOfType(DefaultAdvisorAutoProxyCreator.class).size() == 1);
        // This minimal context cannot accidentally create a Mongo connection or repository.
        assertTrue(context.getBeansOfType(com.mongodb.client.MongoClient.class).isEmpty());
        assertTrue(context.getBeansOfType(com.vaibhav.springreactdemo.user.UserRepository.class).isEmpty());
    }

    @Test
    void logoutClearsOnlyTheAccessCookieWithTheRequiredNonDevFlags() throws Exception {
        var request = post("/api/v1/auth/logout");
        addIdentity(request, "ADMIN");
        addCsrf(request);
        var response = mvc.perform(request).andExpect(status().isNoContent()).andReturn().getResponse();
        var cookie = response.getCookie(CookieBearerTokenResolver.COOKIE_NAME);
        assertNotNull(cookie);
        assertTrue(cookie.getValue() == null || cookie.getValue().isEmpty(), "Logout must clear the cookie");
        assertEquals(0, cookie.getMaxAge());
        assertEquals("/", cookie.getPath());
        assertTrue(cookie.isHttpOnly());
        assertTrue(cookie.getSecure());
        assertTrue(response.getHeaders("Set-Cookie").stream().anyMatch(value -> value.contains("SameSite=Lax")),
                "Logout cookie must retain SameSite");
        assertEquals("", response.getContentAsString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT", "DELETE"})
    void mainChainRejectsEmptyMatchingCsrfMaterial(String method) throws Exception {
        assertBlankCsrfPairRejected(method, "");
    }

    static Stream<Arguments> blankCsrfCases() {
        return Stream.of("POST", "PUT", "DELETE").flatMap(method ->
                Stream.of("spaces", "tabs", "unicode").map(variant -> Arguments.of(method, variant)));
    }

    @ParameterizedTest
    @MethodSource("blankCsrfCases")
    void mainChainRejectsMatchingWhitespaceCsrfMaterial(String method, String variant) throws Exception {
        String blank = switch (variant) {
            case "spaces" -> "   ";
            case "tabs" -> " \t ";
            case "unicode" -> "\u2003";
            default -> throw new IllegalArgumentException("Unknown QA whitespace variant");
        };
        assertBlankCsrfPairRejected(method, blank);
    }

    private void assertBlankCsrfPairRejected(String method, String blank) throws Exception {
        var request = request(HttpMethod.valueOf(method), method.equals("POST")
                ? "/api/v1/products" : "/api/v1/products/qa-id");
        addIdentity(request, "ADMIN");
        request.cookie(new Cookie("XSRF-TOKEN", blank)).header("X-XSRF-TOKEN", blank);
        if (method.equals("POST") || method.equals("PUT")) {
            String body = method.equals("PUT")
                    ? PRODUCT_JSON.replace("\"active\":true", "\"active\":true,\"version\":0") : PRODUCT_JSON;
            request.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        mvc.perform(request).andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Access denied"))
                .andExpect(jsonPath("$.type").value("urn:problem:access-denied"));
        verifyNoInteractions(products);
    }

    @ParameterizedTest
    @ValueSource(strings = {"opaque", "tampered", "expired", "wrong-issuer"})
    void invalidAccessCookiesAreRejectedByTheRealDecoderBeforeProducts(String variant) throws Exception {
        var claims = JwtClaimsSet.builder().subject("qa-matrix").claim("roles", List.of("ADMIN"))
                .issuer(variant.equals("wrong-issuer") ? "qa-other-issuer" : "spring-react-demo")
                .issuedAt(Instant.now().minusSeconds(600))
                .expiresAt(Instant.now().plusSeconds(variant.equals("expired") ? -300 : 60));
        String opaque = context.getBean(JwtEncoder.class).encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
        if (variant.equals("opaque")) opaque = UUID.randomUUID().toString();
        if (variant.equals("tampered")) {
            int signature = opaque.lastIndexOf('.') + 1;
            opaque = opaque.substring(0, signature) + (opaque.charAt(signature) == 'A' ? 'B' : 'A')
                    + opaque.substring(signature + 1);
        }
        mvc.perform(get("/api/v1/products").cookie(new Cookie(CookieBearerTokenResolver.COOKIE_NAME, opaque)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("urn:problem:authentication-required"));
        verifyNoInteractions(products);
    }

    @ParameterizedTest
    @ValueSource(strings = {"unknown", "category", "minPrice", "maxPrice", "q", "page", "size"})
    void searchRejectsUnknownOrRepeatedNonSortParametersBeforeService(String parameter) throws Exception {
        var request = get("/api/v1/products").param(parameter, "1", "2");
        addIdentity(request, "USER");
        mvc.perform(request).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:problem:invalid-request-parameters"));
        verifyNoInteractions(products);
    }

    @Test
    void repeatedAllowlistedSortParameterRemainsSupported() throws Exception {
        var request = get("/api/v1/products").param("sort", "category,asc", "id,desc");
        addIdentity(request, "USER");
        mvc.perform(request).andExpect(status().isOk());
        verify(products).search(isNull(), isNull(), isNull(), isNull(), argThat(pageable ->
                pageable.getSort().getOrderFor("category").isAscending()
                        && pageable.getSort().getOrderFor("id").isDescending()));
    }

    @Test
    void devDocsChainIsPublicWithoutOpeningProductsOrLegacyEndpoint() throws Exception {
        try (var devContext = newContext("dev")) {
            var devMvc = MockMvcBuilders.webAppContextSetup(devContext).apply(springSecurity()).build();
            // No springdoc auto-config in this isolated context: reaching MVC's 404 proves security permits it.
            for (var path : List.of("/swagger-ui.html", "/swagger-ui/index.html", "/v3/api-docs")) {
                devMvc.perform(get(path)).andExpect(status().isNotFound())
                        .andExpect(jsonPath("$.type").value("urn:problem:resource-not-found"));
            }
            devMvc.perform(get("/api/v1/products")).andExpect(status().isUnauthorized());
            devMvc.perform(get("/app-test")).andExpect(status().isUnauthorized());
        }
    }

    private void addIdentity(MockHttpServletRequestBuilder request, String identity) {
        if (identity.equals("ANONYMOUS")) return;
        var claims = JwtClaimsSet.builder().issuer("spring-react-demo").subject("qa-matrix")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (!identity.equals("ROLELESS")) claims.claim("roles", List.of(identity));
        String opaque = context.getBean(JwtEncoder.class).encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
        request.cookie(new Cookie(CookieBearerTokenResolver.COOKIE_NAME, opaque));
    }

    private void addCsrf(MockHttpServletRequestBuilder request) throws Exception {
        MvcResult bootstrap = mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        Cookie cookie = bootstrap.getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(cookie);
        String opaque = JSON.readTree(bootstrap.getResponse().getContentAsString()).get("token").asString();
        assertTrue(java.util.Objects.equals(cookie.getValue(), opaque), "CSRF bootstrap pair must match");
        request.cookie(cookie).header("X-XSRF-TOKEN", opaque);
    }

    private static ProductResponse product() {
        return new ProductResponse("qa-id", "qa-matrix", "QA fixture", "QA", BigDecimal.TEN,
                1, List.of("qa"), Map.of(), true, Instant.EPOCH, Instant.EPOCH, 0L);
    }

    private static AnnotationConfigWebApplicationContext newContext(String profile) {
        var result = new AnnotationConfigWebApplicationContext();
        result.setServletContext(new MockServletContext());
        result.getEnvironment().setActiveProfiles(profile);
        result.getEnvironment().getPropertySources().addFirst(new MapPropertySource("qa-security", Map.of(
                "app.security.jwt.secret", UUID.randomUUID().toString() + UUID.randomUUID(),
                "app.security.jwt.expiry-seconds", "900",
                "app.security.cors.allowed-origins", "http://localhost:5173")));
        result.addBeanFactoryPostProcessor(factory ->
                factory.setConversionService(new ApplicationConversionService()));
        result.register(IsolatedConfiguration.class);
        try {
            result.refresh();
            return result;
        } catch (RuntimeException | Error failure) {
            result.close();
            throw failure;
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableWebMvc
    @EnableWebSecurity
    @EnableSpringDataWebSupport
    @Import({SecurityConfiguration.class, AuthService.class, LoginRateLimiter.class, AuthController.class,
            ProductController.class, AppTestController.class, ApiExceptionHandler.class})
    static class IsolatedConfiguration implements WebMvcConfigurer {
        @Bean(name = AopConfigUtils.AUTO_PROXY_CREATOR_BEAN_NAME)
        static DefaultAdvisorAutoProxyCreator advisorAutoProxyCreator() {
            return new DefaultAdvisorAutoProxyCreator();
        }

        @Bean
        ProductService productService() {
            return mock(ProductService.class);
        }

        @Bean
        DatabaseUserDetailsService databaseUserDetailsService() {
            return mock(DatabaseUserDetailsService.class);
        }

        @Override
        public void configureMessageConverters(HttpMessageConverters.ServerBuilder converters) {
            converters.withJsonConverter(new JacksonJsonHttpMessageConverter(JSON));
        }

        @Override
        public void addResourceHandlers(ResourceHandlerRegistry registry) {
            // Mirror Boot's static-resource fallback without loading Boot or any external resources.
            registry.addResourceHandler("/**").addResourceLocations("classpath:/qa-no-static-resources/");
        }
    }
}
