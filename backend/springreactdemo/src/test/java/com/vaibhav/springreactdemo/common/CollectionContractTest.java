package com.vaibhav.springreactdemo.common;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.bson.Document;
import org.bson.types.Decimal128;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.mongodb.core.convert.MappingMongoConverter;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver;
import org.springframework.data.mongodb.core.mapping.MongoMappingContext;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.http.converter.json.ProblemDetailJacksonMixin;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

import com.vaibhav.springreactdemo.api.ApiExceptionHandler;
import com.vaibhav.springreactdemo.product.Product;
import com.vaibhav.springreactdemo.product.ProductController;
import com.vaibhav.springreactdemo.product.ProductService;
import com.vaibhav.springreactdemo.product.dto.ProductPageResponse;
import com.vaibhav.springreactdemo.product.dto.ProductRequest;
import com.vaibhav.springreactdemo.product.dto.ProductResponse;
import com.vaibhav.springreactdemo.product.dto.ProductUpdateRequest;
import com.vaibhav.springreactdemo.security.AuthUserResponse;
import com.vaibhav.springreactdemo.user.User;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.exc.UnrecognizedPropertyException;
import tools.jackson.databind.json.JsonMapper;

/** In-process JSON/MVC and offline Mongo conversion only; never connects to a database. */
class CollectionContractTest {

    private static final JsonMapper JSON = JsonMapper.builder()
            .addMixIn(ProblemDetail.class, ProblemDetailJacksonMixin.class)
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
    private static final Instant CREATED = Instant.parse("2026-01-01T00:00:00Z");
    private static final String VALID = """
            {"name":"qa-contract","description":null,"category":"QA","price":12.50,
             "stock":0,"tags":["qa"],"specs":{"dimensions":{"width":3},"optional":null},"active":true}
            """;
    private static LocalValidatorFactoryBean validator;
    private ProductService service;
    private MockMvc mvc;

    @BeforeAll
    static void initializeValidator() {
        validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
    }

    @AfterAll
    static void closeValidator() {
        validator.close();
    }

    @BeforeEach
    void initializeStandaloneMvc() {
        service = mock(ProductService.class);
        mvc = MockMvcBuilders.standaloneSetup(new ProductController(service))
                .setControllerAdvice(new ApiExceptionHandler())
                .setValidator(validator)
                .setMessageConverters(new JacksonJsonHttpMessageConverter(JSON))
                .build();
    }

    @Test
    void jsonRoundTripsCollectionsNullsAndVersionWithoutAddingFields() {
        var request = JSON.readValue(VALID, ProductRequest.class);
        assertTrue(validator.validate(request).isEmpty());
        assertTrue(request.specs().containsKey("optional"));
        assertNull(request.specs().get("optional"));
        var tree = JSON.readTree(JSON.writeValueAsString(request));
        assertEquals("qa-contract", tree.get("name").asString());
        assertEquals(new BigDecimal("12.50"), request.price());
        assertFalse(tree.has("id"));
        assertFalse(tree.has("version"));

        var update = JSON.readValue(VALID.strip().replace("\"active\":true", "\"active\":true,\"version\":7"),
                ProductUpdateRequest.class);
        assertEquals(7L, update.version());
        assertEquals(7, JSON.readTree(JSON.writeValueAsString(update)).get("version").asInt());
        assertEquals(request.specs(), update.specs());

        var auth = JSON.readValue("{\"username\":\"qa-user\",\"roles\":[\"USER\"]}", AuthUserResponse.class);
        assertEquals(auth, JSON.readValue(JSON.writeValueAsString(auth), AuthUserResponse.class));
        var page = new ProductPageResponse(List.of(response()), 0, 20, 1, 1, true, true);
        var decoded = JSON.readValue(JSON.writeValueAsString(page), ProductPageResponse.class);
        assertEquals(page, decoded);
    }

    @Test
    void nullOptionalCollectionsRemainValidOnCreateAndUpdate() throws Exception {
        var request = new ProductRequest("qa-contract", null, "QA", BigDecimal.ONE, 0, null, null, true);
        var update = new ProductUpdateRequest("qa-contract", null, "QA", BigDecimal.ONE, 0, null, null, true, 0L);
        assertTrue(validator.validate(request).isEmpty());
        assertTrue(validator.validate(update).isEmpty());
        when(service.create(any())).thenReturn(response());
        mvc.perform(post("/api/v1/products").contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(request)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(0));
        verify(service).create(argThat(value -> value.tags() == null && value.specs() == null));
        when(service.update(eq("qa-id"), any())).thenReturn(response());
        mvc.perform(put("/api/v1/products/qa-id").contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(update)))
                .andExpect(status().isOk());
        verify(service).update(eq("qa-id"), argThat(value -> value.tags() == null
                && value.specs() == null && value.version() == 0L));
    }

    static Stream<String> invalidBodies() {
        return Stream.of(
                VALID.replace("[\"qa\"]", "[null]"),
                VALID.replace("[\"qa\"]", "[\"\"]"),
                VALID.replace("\"width\":3", "\"$where\":true"),
                VALID.replace("\"width\":3", "\"width\":{\"nested\":{\"tooDeep\":true}}"),
                VALID.replace("\"name\":\"qa-contract\"", "\"name\":\" \""),
                VALID.replace("\"stock\":0", "\"stock\":-1"),
                VALID.replace("\"price\":12.50", "\"price\":1.001"));
    }

    @ParameterizedTest
    @MethodSource("invalidBodies")
    void existingValidationStillReturnsFieldLevel400WithoutCallingService(String body) throws Exception {
        mvc.perform(post("/api/v1/products").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Request validation failed"))
                .andExpect(jsonPath("$.errors").isMap());
        mvc.perform(put("/api/v1/products/qa-id").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("\"active\":true", "\"active\":true,\"version\":0")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Request validation failed"))
                .andExpect(jsonPath("$.errors").isMap());
        verifyNoInteractions(service);
    }

    @Test
    void unknownJsonFieldsRemainRejectedForBothRequestRecords() throws Exception {
        var create = VALID.replace("\"active\":true", "\"active\":true,\"id\":\"qa-client\",\"roles\":[\"ADMIN\"]");
        var update = create.replace("\"active\":true", "\"active\":true,\"version\":0");
        assertThrows(UnrecognizedPropertyException.class, () -> JSON.readValue(create, ProductRequest.class));
        assertThrows(UnrecognizedPropertyException.class, () -> JSON.readValue(update, ProductUpdateRequest.class));
        mvc.perform(post("/api/v1/products").contentType(MediaType.APPLICATION_JSON).content(create))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.title").value("Invalid request body"));
        mvc.perform(put("/api/v1/products/qa-id").contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.title").value("Invalid request body"));
        verifyNoInteractions(service);
    }

    @Test
    void staleVersionStillReturnsSanitized409() throws Exception {
        when(service.update(eq("qa-id"), any())).thenThrow(new OptimisticLockingFailureException("test-only"));
        mvc.perform(put("/api/v1/products/qa-id").contentType(MediaType.APPLICATION_JSON)
                .content(VALID.replace("\"active\":true", "\"active\":true,\"version\":0")))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Concurrent update conflict"))
                .andExpect(jsonPath("$.detail").value(
                        "The product changed while this update was being saved. Reload and retry."));
    }

    @Test
    void pathologicalDepthFailsWith400RatherThanAnUnhandledConstructorError() throws Exception {
        String nested = "true";
        for (int depth = 0; depth < 70; depth++) {
            nested = "{\"nested\":" + nested + "}";
        }
        String body = VALID.replace("\"width\":3", "\"width\":" + nested);
        mvc.perform(post("/api/v1/products").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid request body"));
        verifyNoInteractions(service);
    }

    @Test
    void offlineMongoRoundTripPreservesPriceAuditingVersionAndProtectedCollections() throws Exception {
        var converter = mongoConverter();
        var source = new Document("_id", "qa-id").append("name", "qa-contract")
                .append("category", "QA").append("price", new Decimal128(new BigDecimal("12.50")))
                .append("stock", 0).append("tags", List.of("qa"))
                .append("specs", new Document("dimensions", new Document("width", 3)).append("optional", null))
                .append("active", true).append("createdAt", Date.from(CREATED))
                .append("updatedAt", Date.from(CREATED)).append("version", 7L);
        Product product = converter.read(Product.class, source);
        assertEquals(new BigDecimal("12.50"), product.getPrice());
        assertEquals(CREATED, product.getCreatedAt());
        assertEquals(CREATED, product.getUpdatedAt());
        assertEquals(7L, product.getVersion());
        assertThrows(UnsupportedOperationException.class, () -> product.getTags().clear());
        assertThrows(UnsupportedOperationException.class,
                () -> ((Map<?, ?>) product.getSpecs().get("dimensions")).clear());
        Document saved = new Document();
        converter.write(product, saved);
        assertInstanceOf(Decimal128.class, saved.get("price"));
        Product restored = converter.read(Product.class, saved);
        assertEquals(product.getTags(), restored.getTags());
        assertEquals(product.getSpecs(), restored.getSpecs());
        assertEquals(product.getCreatedAt(), restored.getCreatedAt());
        assertEquals(product.getVersion(), restored.getVersion());

        var user = converter.read(User.class,
                new Document("username", "qa-user").append("roles", List.of("USER")));
        assertEquals(Set.of("USER"), user.getRoles());
        assertThrows(UnsupportedOperationException.class, () -> user.getRoles().add("ADMIN"));
        Document savedUser = new Document();
        converter.write(user, savedUser);
        assertEquals(Set.of("USER"), converter.read(User.class, savedUser).getRoles());
    }

    private static MappingMongoConverter mongoConverter() throws Exception {
        var conversions = MongoCustomConversions.create(adapter -> { });
        var context = new MongoMappingContext();
        context.setSimpleTypeHolder(conversions.getSimpleTypeHolder());
        context.afterPropertiesSet();
        var converter = new MappingMongoConverter(NoOpDbRefResolver.INSTANCE, context);
        converter.setCustomConversions(conversions);
        converter.afterPropertiesSet();
        return converter;
    }

    private static ProductResponse response() {
        return new ProductResponse("qa-server-id", "qa-contract", null, "QA", new BigDecimal("12.50"),
                0, List.of("qa"), Map.of("dimensions", Map.of("width", 3)), true, CREATED, CREATED, 0L);
    }
}
