package com.sendseven.oauth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Web configuration for the OAuth application.
 */
@Configuration
public class WebConfig {

    /**
     * Configure WebClient for HTTP requests to SendSeven API.
     */
    @Bean
    public WebClient.Builder webClientBuilder() {
        return WebClient.builder()
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        .maxInMemorySize(1024 * 1024)); // 1MB buffer
    }
}
