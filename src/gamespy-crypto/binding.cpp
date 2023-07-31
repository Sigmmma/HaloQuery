/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
#include <cstring>
#include <napi.h>

extern "C" {
	#include "enctypex_decoder.h"
}

void error(Napi::Env& env, const char* msg) {
	Napi::TypeError::New(env, msg).ThrowAsJavaScriptException();
}

Napi::Value Decryptx(const Napi::CallbackInfo& info) {
	Napi::Env env = info.Env();

	if (info.Length() < 3) {
		error(env, "Expected 3 arguments");
	}

	if (!info[0].IsString()) {
		error(env, "Expected key to be a string");
	}

	if (!info[1].IsString()) {
		error(env, "Expected validate to be a string");
	}

	if (!info[2].IsBuffer()) {
		error(env, "Expected data to be a Buffer");
	}

	std::string  key      = info[0].As<Napi::String>().Utf8Value();
	std::string  validate = info[1].As<Napi::String>().Utf8Value();
	Napi::Buffer data     = info[2].As<Napi::Buffer<char>>();

	// Need to copy these values into mutable memory that satisfies the weird
	// type the gamespy code wants.
	unsigned char mutable_key[key.size()];
	unsigned char mutable_validate[validate.size()];
	unsigned char mutable_data[data.Length()];

	memcpy(mutable_key, key.c_str(), key.size());
	memcpy(mutable_validate, validate.c_str(), validate.size());
	memcpy(mutable_data, data.Data(), data.Length());

	int end_size = enctypex_wrapper(
		mutable_key,
		mutable_validate,
		mutable_data,
		data.Length()
	);

	if (end_size == -1) {
		return env.Null();
	}

	return Napi::Buffer<char>::Copy(
		env, reinterpret_cast<const char*>(mutable_data), end_size
	);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports.Set(
		Napi::String::New(env, "decryptx"),
		Napi::Function::New(env, Decryptx)
	);
	return exports;
}

NODE_API_MODULE(decryptx, Init)
