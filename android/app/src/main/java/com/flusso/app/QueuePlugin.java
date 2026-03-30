package com.flusso.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "QueuePlugin")
public class QueuePlugin extends Plugin {

    private static QueuePlugin instance;
    private JSArray currentQueue = new JSArray();

    public QueuePlugin() {
        super();
        instance = this;
    }

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static QueuePlugin getInstance() {
        return instance;
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        JSArray queue = call.getArray("queue");
        if (queue != null) {
            currentQueue = queue;
            call.resolve();
        } else {
            call.reject("Queue must be provided");
        }
    }

    public JSArray getQueue() {
        return currentQueue;
    }
}
