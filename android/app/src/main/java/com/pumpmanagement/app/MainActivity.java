package com.pumpmanagement.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BiometricLockPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
