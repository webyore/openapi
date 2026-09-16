<?php
// WebYore short link example: PHP 8.1+ with ext-curl.
try {
    $token = getenv('WEBYORE_API_KEY');
    $key = getenv('WEBYORE_IDEMPOTENCY_KEY');
    if (!$token || !$key) throw new RuntimeException('Set WEBYORE_API_KEY and WEBYORE_IDEMPOTENCY_KEY');
    $base = rtrim(getenv('WEBYORE_API_BASE') ?: 'https://api.webyore.com/v1', '/');
    $url = parse_url($base);
    if (isset($url['user']) || isset($url['pass']) || !(($url['scheme'] ?? '') === 'https' || (($url['scheme'] ?? '') === 'http' && in_array($url['host'] ?? '', ['127.0.0.1', 'localhost'], true)))) throw new RuntimeException('Use HTTPS, or HTTP on localhost for tests');
    $body = json_encode(['url' => $argv[1] ?? 'https://example.com/article'], JSON_THROW_ON_ERROR);
    for ($attempt = 0; $attempt < 4; $attempt++) {
        $headers = [];
        $curl = curl_init($base . '/links');
        curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json', 'Idempotency-Key: ' . $key],
            CURLOPT_HEADERFUNCTION => function ($curl, $line) use (&$headers) {
                $pair = explode(':', $line, 2);
                if (count($pair) === 2) $headers[strtolower(trim($pair[0]))] = trim($pair[1]);
                return strlen($line);
            },
        ]);
        $raw = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);
        if ($raw === false) {
            if ($attempt === 3) throw new RuntimeException('Network failure; retry with the same idempotency key');
            sleep(2 ** $attempt); continue;
        }
        $data = json_decode($raw, true) ?? [];
        if ($status >= 200 && $status < 300) {
            if (empty($data['data']['short_url'])) throw new RuntimeException('Invalid response; keep the idempotency key when retrying');
            echo $data['data']['short_url'] . PHP_EOL; exit(0);
        }
        $code = $data['error']['code'] ?? 'request_failed';
        $retryable = in_array($status, [408, 429, 500, 502, 503, 504], true) || ($status === 409 && $code === 'idempotency_in_progress');
        if (!$retryable || $attempt === 3) throw new RuntimeException("WebYore HTTP $status: $code");
        $value = $headers['retry-after'] ?? '';
        $date = $value ? strtotime($value) : false;
        $delay = ctype_digit($value) ? (int)$value : ($date !== false ? $date - time() : 2 ** $attempt);
        if ($delay > 60) throw new RuntimeException('Retry later as requested by Retry-After, using the same idempotency key');
        sleep(max(0, $delay));
    }
} catch (Throwable $error) {
    fwrite(STDERR, $error instanceof RuntimeException ? $error->getMessage() . PHP_EOL : "Request failed; keep the idempotency key when retrying\n");
    exit(1);
}
