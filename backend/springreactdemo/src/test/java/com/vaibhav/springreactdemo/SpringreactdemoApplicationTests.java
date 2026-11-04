package com.vaibhav.springreactdemo;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
class SpringreactdemoApplicationTests {

	@Test
	void contextLoads() {
	}

	@Test
	void appTestReturnsGreetingWithDateTime() throws Exception {
		MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new AppTestController()).build();

		mockMvc.perform(get("/app-test"))
				.andExpect(status().isOk())
				.andExpect(content().string(matchesPattern(
						"Hello Vaibhav! How are you\\? - \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}")));
	}

}
