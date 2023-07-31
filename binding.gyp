{
	'targets': [{
		'target_name': 'gamespy',
		'sources': [
			'src/gamespy-crypto/binding.cpp',
			'src/gamespy-crypto/enctypex_decoder.c',
		],
		'include_dirs': [
			"<!@(node -p \"require('node-addon-api').include\")"
		],
		'dependencies': [
			"<!(node -p \"require('node-addon-api').gyp\")"
		],
		'cflags': ['-fexceptions'],
		'cflags_cc': ['-fexceptions'],
		'defines': ['NAPI_CPP_EXCEPTIONS'],
		'conditions': [
			['OS=="linux"', {
				# Disables noise from warnings in code we don't own.
				'cflags': ['-Wno-pointer-sign', '-Wno-sign-compare'],
			}],
		]
	}]
}
