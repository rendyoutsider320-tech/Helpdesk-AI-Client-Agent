//go:build windows
package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

const serviceName = "HelpdeskAgent"

type agentService struct{}

func (m *agentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}

	stopChan := make(chan struct{})
	go func() {
		runAgentLogic(stopChan)
	}()

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				close(stopChan)
				return
			default:
				log.Printf("unexpected control request #%d", c.Cmd)
			}
		}
	}
}

func runService(name string) {
	err := svc.Run(name, &agentService{})
	if err != nil {
		log.Fatalf("Service failed: %v", err)
	}
}

func handleServiceFlags() bool {
	if len(os.Args) < 2 {
		return false
	}
	cmd := os.Args[1]
	switch cmd {
	case "--install":
		err := installService(serviceName, "Helpdesk Client Agent", "Helpdesk Agent for Telemetry and Management")
		if err != nil {
			log.Fatalf("Failed to install service: %v", err)
		}
		log.Println("Service installed successfully")
		return true
	case "--uninstall", "--remove":
		err := removeService(serviceName)
		if err != nil {
			log.Fatalf("Failed to remove service: %v", err)
		}
		log.Println("Service removed successfully")
		return true
	}
	return false
}

func installService(name, displayName, desc string) error {
	exepath, err := os.Executable()
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(name)
	if err == nil {
		s.Close()
		return fmt.Errorf("service %s already exists", name)
	}
	s, err = m.CreateService(name, exepath, mgr.Config{
		DisplayName: displayName,
		Description: desc,
		StartType:   mgr.StartAutomatic,
	})
	if err != nil {
		return err
	}
	defer s.Close()
	err = eventlog.InstallAsEventCreate(name, eventlog.Error|eventlog.Warning|eventlog.Info)
	if err != nil {
		s.Delete()
		return fmt.Errorf("SetupEventLogSource() failed: %s", err)
	}

	// Set recovery policy (Restart service after 1s on 1st failure, 2s on 2nd, 5s on subsequent failures)
	cmdFailure := exec.Command("sc.exe", "failure", name, "reset=", "86400", "actions=", "restart/1000/restart/2000/restart/5000")
	if err := cmdFailure.Run(); err != nil {
		log.Printf("warning: failed to set recovery policy: %v", err)
	}

	return nil
}

func removeService(name string) error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(name)
	if err != nil {
		return fmt.Errorf("service %s is not installed", name)
	}
	defer s.Close()
	err = s.Delete()
	if err != nil {
		return err
	}
	err = eventlog.Remove(name)
	if err != nil {
		return fmt.Errorf("RemoveEventLogSource() failed: %s", err)
	}
	return nil
}

func isWindowsService() bool {
	isSvc, err := svc.IsWindowsService()
	if err != nil {
		return false
	}
	return isSvc
}
