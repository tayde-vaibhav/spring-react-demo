package com.vaibhav.springreactdemo.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.vaibhav.springreactdemo.user.UserRepository;

@SpringBootTest(properties = {
        "MONGODB_URI=mongodb://localhost:27017/springreactdemo-dev-docs-test",
        "JWT_SECRET=dev-docs-integration-test-signing-key-32-bytes-minimum",
        "DEV_ADMIN_PASSWORD=integration-admin-password",
        "DEV_USER_PASSWORD=integration-user-password",
        "app.seed.products.count=0",
        "spring.data.mongodb.auto-index-creation=false"
})
@AutoConfigureMockMvc
@ActiveProfiles("dev")
class DevApiDocsNotFoundIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserRepository userRepository;

    @Test
    void canonicalOpenApiPathWorksAndTrailingSlashGetsSanitizedNotFound() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));

        mockMvc.perform(get("/v3/api-docs/"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(content().json("{\"status\":404,\"title\":\"Resource not found\"}"))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("NoResourceFoundException"))));
    }
}
