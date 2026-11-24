# Контракты T-Invest API

Вендоренные файлы, чтобы проект собирался без `protoc` и без внешних загрузок.

| Файл | Источник | Лицензия |
|---|---|---|
| `proto/common.proto`, `proto/instruments.proto`, `proto/marketdata.proto` | [RussianInvestments/investAPI](https://github.com/RussianInvestments/investAPI), `src/docs/contracts/` | Apache-2.0 |
| `proto/google/api/field_behavior.proto` | [googleapis/googleapis](https://github.com/googleapis/googleapis/blob/master/google/api/field_behavior.proto) | Apache-2.0 |
| `proto/google/protobuf/descriptor.proto`, `proto/google/protobuf/timestamp.proto` | [protocolbuffers/protobuf](https://github.com/protocolbuffers/protobuf) v3.20.3 | BSD-3-Clause |
| `certs/russian-trusted-root-ca.pem` | [gosuslugi.ru/crt](https://www.gosuslugi.ru/crt) (Russian Trusted Root CA) | публичный корневой сертификат |

`google/api/field_behavior.proto` в официальной версии не импортирует `descriptor.proto`
(protoc знает его встроенно), поэтому в вендоренной копии добавлен явный импорт — иначе
`protox` не может собрать дескрипторы.

`descriptor.proto` взят из ветки 3.20.x: в `main` появился синтаксис editions (`features = ...`),
который парсер protobuf v3 не понимает.

Корневой сертификат нужен, потому что `invest-public-api.tbank.ru` подписан УЦ НУЦ Минцифры,
отсутствующим в стандартном хранилище Linux/macOS. Node подхватывает его через
`NODE_EXTRA_CA_CERTS`, Rust встраивает через `include_str!` в `crates/tinvest/src/client.rs`.
