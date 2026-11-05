package com.vaibhav.springreactdemo.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.vaibhav.springreactdemo.product.ProductService;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest;
import com.vaibhav.springreactdemo.user.User;
import com.vaibhav.springreactdemo.user.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthSecurityIntegrationTest {

    private static final AtomicInteger CLIENT_ID = new AtomicInteger(1);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtEncoder jwtEncoder;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private ProductService productService;

    @BeforeEach
    void setUpUsers() {
        when(userRepository.findByUsername("admin"))
                .thenReturn(
                        Optional.of(new User("admin", passwordEncoder.encode("admin-test-password"), Set.of("ADMIN"))));
        when(userRepository.findByUsername("user"))
                .thenReturn(
                        Optional.of(new User("user", passwordEncoder.encode("user-test-password"), Set.of("USER"))));
        when(productService.create(any())).thenReturn(new ProductResponse(
                "product-1", "Test Product", "Description", "Test", new BigDecimal("12.50"),
                3, List.of(), java.util.Map.of(), true, null, null, 0L));
    }

    @Test
    void loginSetsAnHttpOnlyJwtCookieWithoutReturningTheToken() throws Exception {
        Csrf csrf = csrf();

        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                .with(clientAddress())
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin-test-password\"}"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"username\":\"admin\",\"roles\":[\"ADMIN\"]}"))
                .andReturn();

        Cookie accessCookie = result.getResponse().getCookie(CookieBearerTokenResolver.COOKIE_NAME);
        org.junit.jupiter.api.Assertions.assertNotNull(accessCookie);
        org.junit.jupiter.api.Assertions.assertTrue(accessCookie.isHttpOnly());
        org.junit.jupiter.api.Assertions.assertTrue(accessCookie.getSecure());
        org.junit.jupiter.api.Assertions.assertEquals(900, accessCookie.getMaxAge());
        org.junit.jupiter.api.Assertions
                .assertFalse(result.getResponse().getContentAsString().contains(accessCookie.getValue()));
        org.junit.jupiter.api.Assertions.assertTrue(result.getResponse().getHeader("Set-Cookie").contains("SameSite=Lax"));
    }

    @Test
    void loginFailureReturnsGenericProblemDetail() throws Exception {
        Csrf csrf = csrf();

        mockMvc.perform(post("/api/v1/auth/login")
                .with(clientAddress())
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(content().json("{\"title\":\"Authentication required\",\"status\":401}"))
                .andExpect(content()
                        .string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("wrong-password"))));
    }

    @Test
    void anonymousProductReadReturnsProblemDetail401() throws Exception {
        mockMvc.perform(get("/api/v1/products"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(content().json("{\"status\":401}"));
    }

    @Test
    void validJwtWithoutRolesClaimIsForbiddenInsteadOfServerError() throws Exception {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("spring-react-demo")
                .subject("roleless-user")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(300))
                .build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                org.springframework.security.oauth2.jwt.JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();

        mockMvc.perform(get("/api/v1/products")
                .cookie(new Cookie(CookieBearerTokenResolver.COOKIE_NAME, token)))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void expiredJwtReturnsUnauthorized() throws Exception {
        Instant expiredAt = Instant.now().minusSeconds(60);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("spring-react-demo")
                .subject("expired-user")
                .issuedAt(expiredAt.minusSeconds(300))
                .expiresAt(expiredAt)
                .build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                org.springframework.security.oauth2.jwt.JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();

        int status = mockMvc.perform(get("/api/v1/auth/me")
                .cookie(new Cookie(CookieBearerTokenResolver.COOKIE_NAME, token)))
                .andReturn().getResponse().getStatus();

        org.junit.jupiter.api.Assertions.assertEquals(401, status,
                "An expired signed JWT must be rejected without an internal error");
    }

    @Test
    void actuatorEnvIsUnauthorizedAnonymouslyAndDeniedForAdmin() throws Exception {
        mockMvc.perform(get("/actuator/env"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));

        AuthCookies admin = loginAs("admin", "admin-test-password");
        mockMvc.perform(get("/actuator/env").cookie(admin.access()))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void apiDocumentationIsUnauthorizedInTestProfile() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void staleAccessCookieDoesNotBlockCsrfOrLogin() throws Exception {
        Cookie staleCookie = new Cookie(CookieBearerTokenResolver.COOKIE_NAME, "tampered-token");
        mockMvc.perform(get("/api/v1/auth/csrf").cookie(staleCookie))
                .andExpect(status().isOk());

        Csrf csrf = csrf();
        mockMvc.perform(post("/api/v1/auth/login")
                .with(clientAddress())
                .cookie(staleCookie, csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin-test-password\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void invalidSortAndExcessivePageReturnBadRequest() throws Exception {
        AuthCookies user = loginAs("user", "user-test-password");
        when(productService.search(any(), any(), any(), any(), any()))
                .thenThrow(new IllegalArgumentException("Invalid search parameters"));

        mockMvc.perform(get("/api/v1/products").cookie(user.access()).param("sort", "hacker,asc"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mockMvc.perform(get("/api/v1/products").cookie(user.access()).param("page", "99999"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void concurrentProductUpdateReturnsConflict() throws Exception {
        AuthCookies admin = loginAs("admin", "admin-test-password");
        when(productService.update(anyString(), any(ProductUpdateRequest.class))).thenThrow(
                new OptimisticLockingFailureException("stale update"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductUpdateJson(0)))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void adminUpdateReturnsTheNewVersion() throws Exception {
        AuthCookies admin = loginAs("admin", "admin-test-password");
        when(productService.update(anyString(), any(ProductUpdateRequest.class))).thenReturn(new ProductResponse(
                "product-1", "Test Product", "Description", "Test", new BigDecimal("12.50"),
                3, List.of(), java.util.Map.of(), true, null, null, 1L));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductUpdateJson(0)))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.version").value(1));
    }

    @Test
    void updateRequiresVersion() throws Exception {
        AuthCookies admin = loginAs("admin", "admin-test-password");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductJson()))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));

        verify(productService, never()).update(anyString(), any(ProductUpdateRequest.class));
    }

    @Test
    void userCannotCreateProduct() throws Exception {
        AuthCookies cookies = loginAs("user", "user-test-password");

        mockMvc.perform(post("/api/v1/products")
                .cookie(cookies.access(), cookies.csrf().cookie())
                .header("X-XSRF-TOKEN", cookies.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductJson()))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        verify(productService, never()).create(any());
    }

    @Test
    void productWritesRejectUnknownServerControlledFields() throws Exception {
        AuthCookies admin = loginAs("admin", "admin-test-password");
        String requestWithUnknownFields = withUnknownServerFields(validProductJson());

        mockMvc.perform(post("/api/v1/products")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestWithUnknownFields))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(withUnknownServerFields(validProductUpdateJson(0))))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));

        verify(productService, never()).create(any());
        verify(productService, never()).update(anyString(), any(ProductUpdateRequest.class));
    }

    @Test
    void unsupportedProductWriteMediaTypeReturnsSanitized415ProblemDetail() throws Exception {
        AuthCookies admin = loginAs("admin", "admin-test-password");

        mockMvc.perform(post("/api/v1/products")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token())
                .contentType(MediaType.TEXT_PLAIN)
                .content("not json"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(content().json("{\"status\":415,\"title\":\"Unsupported media type\"}"))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("HttpMediaTypeNotSupportedException"))));

        verify(productService, never()).create(any());
    }

    @Test
    void productMutationsRequireTheCsrfHeaderToMatchTheCookieToken() throws Exception {
        AuthCookies admin = loginAs("admin", "admin-test-password");

        int missingPostHeader = mockMvc.perform(post("/api/v1/products")
                .cookie(admin.access(), admin.csrf().cookie())
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductJson()))
                .andReturn().getResponse().getStatus();

        int wrongPostHeader = mockMvc.perform(post("/api/v1/products")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", "incorrect-csrf-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductJson()))
                .andReturn().getResponse().getStatus();

        int missingDeleteHeader = mockMvc.perform(delete("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie()))
                .andReturn().getResponse().getStatus();

        int wrongDeleteHeader = mockMvc.perform(delete("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", "incorrect-csrf-token"))
                .andReturn().getResponse().getStatus();

        org.junit.jupiter.api.Assertions.assertEquals(
                List.of(403, 403, 403, 403),
                List.of(missingPostHeader, wrongPostHeader, missingDeleteHeader, wrongDeleteHeader),
                "Unsafe requests must reject missing or mismatched CSRF headers");

        verify(productService, never()).create(any());
        verify(productService, never()).delete(anyString());

        int validDeleteHeader = mockMvc.perform(delete("/api/v1/products/product-1")
                .cookie(admin.access(), admin.csrf().cookie())
                .header("X-XSRF-TOKEN", admin.csrf().token()))
                .andReturn().getResponse().getStatus();

        org.junit.jupiter.api.Assertions.assertEquals(204, validDeleteHeader,
                "A request with the matching CSRF header should succeed");
        verify(productService).delete("product-1");
    }

    @Test
    void adminCanCreateProductAndReadStats() throws Exception {
        AuthCookies cookies = loginAs("admin", "admin-test-password");

        mockMvc.perform(post("/api/v1/products")
                .cookie(cookies.access(), cookies.csrf().cookie())
                .header("X-XSRF-TOKEN", cookies.csrf().token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(validProductJson()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"));

        when(productService.getStats()).thenReturn(List.of());
        mockMvc.perform(get("/api/v1/products/stats").cookie(cookies.access()))
                .andExpect(status().isOk());
    }

    @Test
    void operatorStyleSearchParameterIsRejected() throws Exception {
        AuthCookies cookies = loginAs("user", "user-test-password");

        mockMvc.perform(get("/api/v1/products")
                .cookie(cookies.access())
                .param("category[$ne]", "ignored"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        verify(productService, never()).search(any(), any(), any(), any(), any());
    }

    private Csrf csrf() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie cookie = result.getResponse().getCookie("XSRF-TOKEN");
        org.junit.jupiter.api.Assertions.assertNotNull(cookie, "CSRF endpoint should set its CSRF cookie");
        return new Csrf(cookie, cookie.getValue());
    }

    private AuthCookies loginAs(String username, String password) throws Exception {
        Csrf csrf = csrf();
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                .with(clientAddress())
                .cookie(csrf.cookie())
                .header("X-XSRF-TOKEN", csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie access = result.getResponse().getCookie(CookieBearerTokenResolver.COOKIE_NAME);
        org.junit.jupiter.api.Assertions.assertNotNull(access);
        return new AuthCookies(access, csrf);
    }

    private RequestPostProcessor clientAddress() {
        int host = CLIENT_ID.getAndIncrement();
        return request -> {
            request.setRemoteAddr("192.0.2." + host);
            return request;
        };
    }

    private String validProductJson() {
        return "{\"name\":\"Test Product\",\"description\":\"A test product\",\"category\":\"Test\",\"price\":12.50,\"stock\":3,\"tags\":[\"test\"],\"specs\":{\"size\":\"small\"},\"active\":true}";
    }

    private String validProductUpdateJson(long version) {
        return "{\"name\":\"Test Product\",\"description\":\"A test product\",\"category\":\"Test\",\"price\":12.50,\"stock\":3,\"tags\":[\"test\"],\"specs\":{\"size\":\"small\"},\"active\":true,\"version\":" + version + "}";
    }

    private String withUnknownServerFields(String json) {
        return json.substring(0, json.length() - 1)
                + ",\"id\":\"client-controlled\",\"roles\":[\"ADMIN\"]}";
    }

    private record Csrf(Cookie cookie, String token) {
    }

    private record AuthCookies(Cookie access, Csrf csrf) {
    }
}
