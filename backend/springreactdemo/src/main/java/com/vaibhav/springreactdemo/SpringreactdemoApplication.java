package com.vaibhav.springreactdemo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.mongodb.config.EnableMongoAuditing;

@SpringBootApplication
@EnableMongoAuditing
public class SpringreactdemoApplication {

	public static void main(String[] args) {
		SpringApplication.run(SpringreactdemoApplication.class, args);
	}

}
