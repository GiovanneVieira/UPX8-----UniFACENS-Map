package com.giovannevq.unifacensclient

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.ar.core.Anchor
import com.google.ar.core.Session

/**
 * Módulo nativo para resolve de Cloud Anchors cross-session.
 * Contorna o bug do Viro 3.0.3 chamando ARCore SDK diretamente.
 *
 * API do ARCore 1.43 (SÍNCRONA): session.resolveCloudAnchor(id) retorna
 * um Anchor IMEDIATAMENTE em estado TASK_IN_PROGRESS. Poll até estado
 * terminal (SUCCESS ou ERROR_*). Posição em COORDENADAS DA SESSÃO AR.
 */
class CloudAnchorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        @Volatile
        var arSession: Session? = null
        private const val POLL_INTERVAL_MS = 500L
        private const val POLL_TIMEOUT_MS = 120_000L // 2 min máx
    }

    override fun getName() = "CloudAnchorNative"

    @ReactMethod
    fun resolveCloudAnchor(cloudAnchorId: String, promise: Promise) {
        val session = arSession ?: findSessionInViews()
        if (session == null) {
            promise.reject("NO_SESSION", "ARCore session não disponível")
            return
        }

        Handler(Looper.getMainLooper()).post {
            try {
                // API síncrona: retorna o anchor imediatamente, em TASK_IN_PROGRESS
                val anchor = session.resolveCloudAnchor(cloudAnchorId)
                pollAnchorState(anchor, cloudAnchorId, promise, System.currentTimeMillis())
            } catch (e: Exception) {
                promise.reject("ERROR", "Erro no resolve: ${e.message}", e)
            }
        }
    }

    /** Poll do estado do anchor até terminal (SUCCESS ou ERROR_*). */
    private fun pollAnchorState(
        anchor: Anchor,
        cloudAnchorId: String,
        promise: Promise,
        startTime: Long,
    ) {
        val state = anchor.cloudAnchorState
        val elapsed = System.currentTimeMillis() - startTime

        when {
            state == Anchor.CloudAnchorState.SUCCESS -> {
                try {
                    val pose = anchor.pose
                    val result = Arguments.createMap()
                    result.putDouble("x", pose.tx().toDouble())
                    result.putDouble("y", pose.ty().toDouble())
                    result.putDouble("z", pose.tz().toDouble())
                    result.putDouble("qx", pose.qx().toDouble())
                    result.putDouble("qy", pose.qy().toDouble())
                    result.putDouble("qz", pose.qz().toDouble())
                    result.putDouble("qw", pose.qw().toDouble())
                    result.putString("cloudAnchorId", cloudAnchorId)
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject("POSE_ERROR", "Erro ao ler pose: ${e.message}")
                }
            }
            state == Anchor.CloudAnchorState.TASK_IN_PROGRESS && elapsed < POLL_TIMEOUT_MS -> {
                // Ainda resolvendo (SIFT matching) — poll de novo
                Handler(Looper.getMainLooper()).postDelayed({
                    pollAnchorState(anchor, cloudAnchorId, promise, startTime)
                }, POLL_INTERVAL_MS)
            }
            state == Anchor.CloudAnchorState.TASK_IN_PROGRESS -> {
                promise.reject("TIMEOUT", "Resolve não completou em ${POLL_TIMEOUT_MS / 1000}s")
            }
            state == Anchor.CloudAnchorState.ERROR_CLOUD_ID_NOT_FOUND -> {
                promise.reject("NOT_FOUND", "Cloud anchor expirada ou inválida")
            }
            state == Anchor.CloudAnchorState.ERROR_NOT_AUTHORIZED -> {
                promise.reject("NOT_AUTHORIZED", "API key sem autorização")
            }
            state == Anchor.CloudAnchorState.ERROR_INTERNAL -> {
                promise.reject("INTERNAL", "Erro interno do ARCore")
            }
            else -> {
                promise.reject("RESOLVE_FAILED", "CloudAnchorState: $state")
            }
        }
    }

    @ReactMethod
    fun registerSession(promise: Promise) {
        val session = findSessionInViews()
        if (session != null) {
            arSession = session
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun isSessionAvailable(promise: Promise) {
        promise.resolve(arSession != null || findSessionInViews() != null)
    }

    private fun findSessionInViews(): Session? {
        arSession?.let { return it }
        val activity = getCurrentActivity() ?: return null
        val rootView = activity.window?.decorView ?: return null
        return findSessionInView(rootView)
    }

    private fun findSessionInView(view: android.view.View): Session? {
        tryGetSessionFromView(view)?.let { return it }
        if (view is android.view.ViewGroup) {
            for (i in 0 until view.childCount) {
                findSessionInView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun tryGetSessionFromView(view: android.view.View): Session? {
        return try {
            for (fieldName in listOf("mSession", "mArSession", "session")) {
                try {
                    val field = view.javaClass.getDeclaredField(fieldName)
                    field.isAccessible = true
                    val value = field.get(view)
                    if (value is Session) return value
                } catch (_: NoSuchFieldException) {}
            }
            for (methodName in listOf("getSession", "getARSession")) {
                try {
                    val method = view.javaClass.getDeclaredMethod(methodName)
                    method.isAccessible = true
                    val value = method.invoke(view)
                    if (value is Session) return value
                } catch (_: NoSuchMethodException) {}
            }
            null
        } catch (_: Exception) {
            null
        }
    }
}
