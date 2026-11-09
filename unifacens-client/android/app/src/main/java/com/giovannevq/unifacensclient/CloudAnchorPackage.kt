package com.giovannevq.unifacensclient

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registra o CloudAnchorModule no React Native.
 * Este módulo contorna o bug do Viro 3.0.3 onde resolveCloudAnchor
 * pendura a promise para sempre em resolves cross-session.
 */
class CloudAnchorPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(CloudAnchorModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
